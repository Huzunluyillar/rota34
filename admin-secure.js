// ============================================
// ROTA 34 - SUPABASE GÜVENLİK SİSTEMİ
// Google Authenticator + Backend Database
// ============================================

// SUPABASE CONFIGURATION
const SUPABASE_CONFIG = {
    url: 'https://zyjtcywneublnmssiqhm.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5anRjeXduZXVibG5tc3NpcWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTgxMzksImV4cCI6MjA4MzI5NDEzOX0.7o0w5i2VJuzzK0QfEK1l3WMReBHZyehdY0_qZQEuV9U',
    serviceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5anRjeXduZXVibG5tc3NpcWhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcxODEzOSwiZXhwIjoyMDgzMjk0MTM5fQ.FGbUjKbRsd0GQXeJD6-MM6VfVsFGt2CHDrjwiKE8EYA'
};

// Güvenlik Ayarları
const SECURITY_CONFIG = {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000,
    SESSION_TIMEOUT: 60 * 60 * 1000,
    REQUIRE_2FA: true  // 🟢 2FA AKTİF
};

let supabaseClient = null;

function initSupabase() {
    if (!supabaseClient) {
        supabaseClient = supabase.createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.serviceKey
        );
    }
    return supabaseClient;
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

class TOTPGenerator {
    constructor(secret) {
        this.secret = secret;
    }

    base32Decode(base32) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        base32 = base32.replace(/=+$/, '').toUpperCase();
        
        for (let i = 0; i < base32.length; i++) {
            const index = alphabet.indexOf(base32[i]);
            if (index === -1) continue;
            bits += index.toString(2).padStart(5, '0');
        }
        
        const bytes = [];
        for (let i = 0; i + 8 <= bits.length; i += 8) {
            bytes.push(parseInt(bits.substring(i, i + 8), 2));
        }
        
        return new Uint8Array(bytes);
    }

    async hmacSha1(key, message) {
        const cryptoKey = await crypto.subtle.importKey(
            'raw', key,
            { name: 'HMAC', hash: 'SHA-1' },
            false, ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
        return new Uint8Array(signature);
    }

    async verifyTOTP(token, window = 1) {
        for (let i = -window; i <= window; i++) {
            const timeStep = 30;
            const epoch = Math.floor(Date.now() / 1000);
            const time = Math.floor(epoch / timeStep) + i;
            
            const timeBuffer = new ArrayBuffer(8);
            const timeView = new DataView(timeBuffer);
            timeView.setUint32(4, time, false);
            
            const key = this.base32Decode(this.secret);
            const hmac = await this.hmacSha1(key, new Uint8Array(timeBuffer));
            
            const offset = hmac[hmac.length - 1] & 0xf;
            const code = (
                ((hmac[offset] & 0x7f) << 24) |
                ((hmac[offset + 1] & 0xff) << 16) |
                ((hmac[offset + 2] & 0xff) << 8) |
                (hmac[offset + 3] & 0xff)
            ) % 1000000;
            
            if (code.toString().padStart(6, '0') === token) {
                return true;
            }
        }
        return false;
    }
}

class BruteForceProtection {
    constructor() {
        this.attempts = this.loadAttempts();
    }

    loadAttempts() {
        const stored = localStorage.getItem('login_attempts');
        if (!stored) return { count: 0, lastAttempt: 0, lockedUntil: 0 };
        return JSON.parse(stored);
    }

    saveAttempts() {
        localStorage.setItem('login_attempts', JSON.stringify(this.attempts));
    }

    isLocked() {
        if (this.attempts.lockedUntil > Date.now()) {
            return true;
        }
        if (this.attempts.lockedUntil > 0 && this.attempts.lockedUntil <= Date.now()) {
            this.reset();
        }
        return false;
    }

    getRemainingLockTime() {
        if (!this.isLocked()) return 0;
        return Math.ceil((this.attempts.lockedUntil - Date.now()) / 1000);
    }

    recordFailure() {
        this.attempts.count++;
        this.attempts.lastAttempt = Date.now();
        
        if (this.attempts.count >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
            this.attempts.lockedUntil = Date.now() + SECURITY_CONFIG.LOCKOUT_DURATION;
        }
        
        this.saveAttempts();
    }

    reset() {
        this.attempts = { count: 0, lastAttempt: 0, lockedUntil: 0 };
        this.saveAttempts();
    }
}

class SessionManager {
    constructor() {
        this.checkSession();
    }

    createSession(username) {
        const session = {
            username: username,
            loginTime: Date.now(),
            lastActivity: Date.now(),
            token: this.generateToken()
        };
        
        sessionStorage.setItem('admin_session', JSON.stringify(session));
        this.startSessionTimer();
    }

    generateToken() {
        return Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    isValid() {
        const session = this.getSession();
        if (!session) return false;
        
        const now = Date.now();
        if (now - session.lastActivity > SECURITY_CONFIG.SESSION_TIMEOUT) {
            this.destroy();
            return false;
        }
        
        session.lastActivity = now;
        sessionStorage.setItem('admin_session', JSON.stringify(session));
        return true;
    }

    getSession() {
        const stored = sessionStorage.getItem('admin_session');
        if (!stored) return null;
        return JSON.parse(stored);
    }

    destroy() {
        sessionStorage.removeItem('admin_session');
        sessionStorage.removeItem('adminAuth');
    }

    checkSession() {
        setInterval(() => {
            if (!this.isValid() && window.location.pathname.includes('admin')) {
                window.location.href = 'admin_panel.html';
            }
        }, 60000);
    }

    startSessionTimer() {
        const updateActivity = () => {
            const session = this.getSession();
            if (session) {
                session.lastActivity = Date.now();
                sessionStorage.setItem('admin_session', JSON.stringify(session));
            }
        };

        document.addEventListener('mousemove', updateActivity);
        document.addEventListener('keypress', updateActivity);
        document.addEventListener('click', updateActivity);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    
    const bruteForce = new BruteForceProtection();
    const errorDiv = document.getElementById('loginError');
    const sb = initSupabase();
    
    if (bruteForce.isLocked()) {
        const remaining = bruteForce.getRemainingLockTime();
        errorDiv.textContent = `🔒 Çok fazla hatalı deneme! ${remaining} saniye sonra tekrar deneyebilirsiniz.`;
        errorDiv.style.display = 'block';
        return;
    }
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const { data: users, error } = await sb
            .from('admin_users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error || !users) {
            bruteForce.recordFailure();
            const remaining = SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - bruteForce.attempts.count;
            errorDiv.textContent = `❌ Kullanıcı adı veya şifre hatalı! Kalan deneme: ${remaining}`;
            errorDiv.style.display = 'block';
            await logLoginAttempt(sb, username, false);
            return;
        }
        
        const passwordHash = await hashPassword(password);
        if (passwordHash !== users.password_hash) {
            bruteForce.recordFailure();
            const remaining = SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - bruteForce.attempts.count;
            errorDiv.textContent = `❌ Kullanıcı adı veya şifre hatalı! Kalan deneme: ${remaining}`;
            errorDiv.style.display = 'block';
            await logLoginAttempt(sb, username, false);
            return;
        }
        
        // 🔴 2FA kontrolü - opsiyonel
        if (SECURITY_CONFIG.REQUIRE_2FA && users.totp_secret) {
            show2FAPrompt(users, bruteForce, sb);
        } else {
            // 2FA kapalıysa direkt giriş yap
            bruteForce.reset();
            await sb
                .from('admin_users')
                .update({ last_login: new Date().toISOString() })
                .eq('username', username);
            await logLoginAttempt(sb, username, true);
            completeLogin(username);
        }
        
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = '❌ Bir hata oluştu. Lütfen tekrar deneyin.';
        errorDiv.style.display = 'block';
    }
}

async function logLoginAttempt(sb, username, success) {
    try {
        await sb.from('login_logs').insert([{
            username: username,
            success: success,
            ip_address: 'N/A',
            user_agent: navigator.userAgent
        }]);
    } catch (error) {
        console.error('Log error:', error);
    }
}

function show2FAPrompt(user, bruteForce, sb) {
    const promptHTML = `
        <div style="text-align: center; padding: 2rem;">
            <h3 style="margin-bottom: 1rem;">🔐 İki Faktörlü Doğrulama</h3>
            <p style="margin-bottom: 1rem;">Google Authenticator uygulamanızdan 6 haneli kodu girin:</p>
            <input type="text" id="twoFactorCode" placeholder="000000" 
                   style="width: 200px; padding: 0.8rem; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 1.2rem; text-align: center; letter-spacing: 0.3rem;" maxlength="6" autofocus>
            <br>
            <button onclick="verify2FA('${user.username}', '${user.totp_secret}')" style="margin-top: 1rem; padding: 1rem 2rem; background: linear-gradient(135deg, #FF6B35, #F77F00); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Doğrula</button>
            <br>
            <button onclick="location.reload()" style="margin-top: 0.5rem; padding: 0.5rem 1rem; background: transparent; color: #666; border: none; cursor: pointer;">← Geri Dön</button>
        </div>
    `;
    
    const loginScreen = document.getElementById('loginScreen');
    const loginBox = loginScreen.querySelector('.login-box');
    loginBox.innerHTML = promptHTML;
}

async function verify2FA(username, totpSecret) {
    const code = document.getElementById('twoFactorCode').value;
    const bruteForce = new BruteForceProtection();
    const sb = initSupabase();
    
    if (code.length !== 6) {
        alert('❌ Lütfen 6 haneli kodu girin!');
        return;
    }
    
    try {
        const totp = new TOTPGenerator(totpSecret);
        const isValid = await totp.verifyTOTP(code);
        
        if (isValid) {
            bruteForce.reset();
            
            await sb
                .from('admin_users')
                .update({ last_login: new Date().toISOString() })
                .eq('username', username);
            
            await logLoginAttempt(sb, username, true);
            
            completeLogin(username);
        } else {
            bruteForce.recordFailure();
            alert('❌ Kod hatalı! Lütfen tekrar deneyin.');
            
            if (bruteForce.isLocked()) {
                location.reload();
            }
        }
    } catch (error) {
        console.error('2FA verification error:', error);
        alert('❌ Bir hata oluştu. Lütfen tekrar deneyin.');
    }
}

function completeLogin(username) {
    const sessionManager = new SessionManager();
    sessionManager.createSession(username);
    sessionStorage.setItem('adminAuth', 'true');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').classList.add('active');
}

function handleLogout() {
    if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
        const sessionManager = new SessionManager();
        sessionManager.destroy();
        location.reload();
    }
}

function initMenuNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            
            menuItems.forEach(m => m.classList.remove('active'));
            this.classList.add('active');
            
            document.querySelectorAll('.content-section').forEach(s => {
                s.classList.remove('active');
            });
            document.getElementById(section).classList.add('active');
            
            const titles = {
                'dashboard': 'Dashboard',
                'colors': 'Renkler & Tema',
                'content': 'İçerik Yönetimi',
                'features': 'Özellikler'
            };
            document.getElementById('headerTitle').textContent = titles[section];
        });
    });
}

// Test Link Yönetimi
async function saveTestSettings() {
    const enabled = document.getElementById('testLinkEnabled').checked;
    const link = document.getElementById('testLink').value;
    const inputGroup = document.getElementById('testLinkInputGroup');
    const status = document.getElementById('testLinkStatus');
    inputGroup.style.display = enabled ? 'block' : 'none';

    try {
        const sb = initSupabase();
        
        const { data, error } = await sb
            .from('site_settings')
            .upsert({
                key: 'test_link',
                value: {
                    enabled: enabled,
                    link: link
                },
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'key'
            });
        
        if (error) throw error;
        
        status.style.display = 'block';
        status.style.background = '#d4edda';
        status.style.color = '#155724';
        status.textContent = '✅ Ayarlar kaydedildi! Ana sayfada ' + (enabled ? 'buton görünür' : 'buton gizli');
        
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('Test link kaydetme hatası:', error);
        status.style.display = 'block';
        status.style.background = '#f8d7da';
        status.style.color = '#721c24';
        status.textContent = '❌ Hata: ' + error.message;
    }
}

async function loadTestSettings() {
    try {
        const sb = initSupabase();
        const { data, error } = await sb
            .from('site_settings')
            .select('*')
            .eq('key', 'test_link')
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        if (data && data.value) {
            document.getElementById('testLinkEnabled').checked = data.value.enabled || false;
            document.getElementById('testLink').value = data.value.link || '';
            document.getElementById('testLinkInputGroup').style.display = data.value.enabled ? 'block' : 'none';
        }
        
    } catch (error) {
        console.error('Test link yükleme hatası:', error);
    }
}

// Deneme Süresi Yönetimi
async function saveTrialDays() {
    const days = parseInt(document.getElementById('trialDays').value);
    const status = document.getElementById('trialDaysStatus');
    
    if (days < 1 || days > 365) {
        status.style.display = 'block';
        status.style.background = '#f8d7da';
        status.style.color = '#721c24';
        status.textContent = '❌ Deneme süresi 1-365 gün arasında olmalı!';
        return;
    }

    try {
        const sb = initSupabase();
        
        const { data, error } = await sb
            .from('site_settings')
            .upsert({
                key: 'trial_days',
                value: { days: days },
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'key'
            });
        
        if (error) throw error;
        
        status.style.display = 'block';
        status.style.background = '#d4edda';
        status.style.color = '#155724';
        status.textContent = `✅ Deneme süresi ${days} gün olarak kaydedildi!`;
        
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('Deneme süresi kaydetme hatası:', error);
        status.style.display = 'block';
        status.style.background = '#f8d7da';
        status.style.color = '#721c24';
        status.textContent = '❌ Hata: ' + error.message;
    }
}

async function loadTrialDays() {
    try {
        const sb = initSupabase();
        const { data, error } = await sb
            .from('site_settings')
            .select('*')
            .eq('key', 'trial_days')
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        if (data && data.value && data.value.days) {
            document.getElementById('trialDays').value = data.value.days;
        }
        
    } catch (error) {
        console.error('Deneme süresi yükleme hatası:', error);
    }
}

// Sayfa Yüklenme
document.addEventListener('DOMContentLoaded', function() {
    const sessionManager = new SessionManager();
    if (sessionManager.isValid()) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').classList.add('active');
        loadTestSettings();
        loadTrialDays();
    }
    initMenuNavigation();
});