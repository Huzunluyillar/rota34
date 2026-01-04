// admin.js - Ortak JavaScript Fonksiyonları

// Sayfa yüklendiğinde oturum kontrolü
function checkAuth() {
    const isAuth = sessionStorage.getItem('adminAuth');
    if (!isAuth && !window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
    }
}

// Çıkış yap
function logout() {
    if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
        sessionStorage.removeItem('adminAuth');
        window.location.href = 'index.html';
    }
}

// Başarı mesajı göster
function showSuccess(message) {
    const successDiv = document.getElementById('successMsg');
    if (successDiv) {
        successDiv.textContent = '✅ ' + message;
        successDiv.style.display = 'block';
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 3000);
    }
}

// Veri kaydetme fonksiyonu (LocalStorage kullanarak)
function saveData(key, value) {
    try {
        const data = JSON.parse(localStorage.getItem('rota34_admin') || '{}');
        data[key] = value;
        localStorage.setItem('rota34_admin', JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Veri kaydedilemedi:', error);
        return false;
    }
}

// Veri okuma fonksiyonu
function getData(key, defaultValue = '') {
    try {
        const data = JSON.parse(localStorage.getItem('rota34_admin') || '{}');
        return data[key] || defaultValue;
    } catch (error) {
        console.error('Veri okunamadı:', error);
        return defaultValue;
    }
}

// Renk değiştirme fonksiyonu
function updateColor(colorVar, colorValue) {
    document.documentElement.style.setProperty(colorVar, colorValue);
    saveData(colorVar, colorValue);
}

// Sayfa yüklendiğinde çalışacak
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    
    // Kaydedilmiş renkleri yükle
    const savedColors = {
        '--primary': getData('--primary', '#FF6B35'),
        '--secondary': getData('--secondary', '#0F2027'),
        '--accent': getData('--accent', '#F77F00')
    };
    
    Object.keys(savedColors).forEach(key => {
        document.documentElement.style.setProperty(key, savedColors[key]);
    });
});