// admin-secure.js
// Bu dosya admin panelinin giriş ve çıkış işlemlerini yapar

// Giriş yapma fonksiyonu
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    // Doğru kullanıcı adı ve şifre
    const correctUser = 'KaanKaran';
    const correctPass = 'Qetuo12345@/';
    
    // Kontrol et
    if (username === correctUser && password === correctPass) {
        // Giriş başarılı
        errorDiv.style.display = 'none';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').classList.add('active');
        sessionStorage.setItem('adminAuth', 'true');
    } else {
        // Giriş hatalı
        errorDiv.textContent = 'Kullanıcı adı veya şifre hatalı!';
        errorDiv.style.display = 'block';
    }
}

// Çıkış yapma fonksiyonu
function handleLogout() {
    if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
        sessionStorage.removeItem('adminAuth');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('loginError').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('adminPanel').classList.remove('active');
    }
}

// Menü geçişleri
function initMenuNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            
            // Aktif menüyü değiştir
            menuItems.forEach(m => m.classList.remove('active'));
            this.classList.add('active');
            
            // İçeriği göster
            document.querySelectorAll('.content-section').forEach(s => {
                s.classList.remove('active');
            });
            document.getElementById(section).classList.add('active');
            
            // Başlık değiştir
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

// Sayfa açılınca çalışacak
document.addEventListener('DOMContentLoaded', function() {
    // Daha önce giriş yapılmış mı kontrol et
    const isAuth = sessionStorage.getItem('adminAuth');
    if (isAuth === 'true') {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').classList.add('active');
    }
    
    // Menüleri aktif et
    initMenuNavigation();
});