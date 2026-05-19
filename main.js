import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ========== DOM ELEMENTS ==========
const openCameraBtn = document.getElementById('openCameraBtn');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const fileUpload = document.getElementById('fileUpload');
const imageGrid = document.getElementById('imageGrid');
const photoCount = document.getElementById('photoCount');
const cameraScreen = document.getElementById('cameraScreen');
const cameraPreview = document.getElementById('cameraPreview');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const closeCamera = document.getElementById('closeCamera');
const switchCamera = document.getElementById('switchCamera');
const hiddenCanvas = document.getElementById('hiddenCanvas');
const copyBtn = document.getElementById('copyBtn');
const urlText = document.getElementById('urlText');

// Edit modal elements
const editModal = document.getElementById('editModal');
const previewImage = document.getElementById('previewImage');
const commentInput = document.getElementById('commentInput');
const starSpans = document.querySelectorAll('#starRating span');
const weatherText = document.getElementById('weatherText');
const timeText = document.getElementById('timeText');
const locationText = document.getElementById('locationText');
const closeEditModal = document.getElementById('closeEditModal');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const confirmSendBtn = document.getElementById('confirmSendBtn');

// ========== STATE ==========
let currentStream = null;
let currentFacing = 'environment';
let pendingImageFile = null;
let selectedRating = 0;
let isUpdatingLocation = false; // Tránh gọi nhiều lần

// Hàm chuyển mã thời tiết (dựa trên Open-Meteo)
function getWeatherCondition(code) {
    const weatherMap = {
        0: { icon: '☀️', text: 'Nắng' }, 1: { icon: '🌤️', text: 'Ít mây' }, 2: { icon: '⛅', text: 'Có mây' },
        3: { icon: '☁️', text: 'Nhiều mây' }, 45: { icon: '🌫️', text: 'Sương mù' }, 48: { icon: '🌫️', text: 'Sương mù' },
        51: { icon: '🌧️', text: 'Mưa nhẹ' }, 53: { icon: '🌧️', text: 'Mưa' }, 55: { icon: '🌧️', text: 'Mưa lớn' },
        61: { icon: '🌧️', text: 'Mưa' }, 63: { icon: '🌧️', text: 'Mưa vừa' }, 65: { icon: '🌧️', text: 'Mưa lớn' },
        71: { icon: '❄️', text: 'Tuyết' }, 73: { icon: '❄️', text: 'Tuyết vừa' }, 75: { icon: '❄️', text: 'Tuyết lớn' },
        80: { icon: '🌧️', text: 'Mưa rào' }, 95: { icon: '⛈️', text: 'Giông bão' }
    };
    return weatherMap[code] || { icon: '🌡️', text: 'Bình thường' };
}

// ========== LẤY VỊ TRÍ VÀ THỜI TIẾT (CÓ YÊU CẦU QUYỀN) ==========
async function askForLocationAndWeather() {
    // Hiển thị trạng thái đang tải
    locationText.innerHTML = '📍 Đang yêu cầu quyền vị trí...';
    weatherText.innerHTML = '☁️ Đang tải thời tiết...';
    
    // 1. Kiểm tra trình duyệt có hỗ trợ Geolocation không
    if (!navigator.geolocation) {
        locationText.innerHTML = '📍 Trình duyệt không hỗ trợ GPS';
        weatherText.innerHTML = '☁️ Không thể lấy thời tiết';
        return;
    }

    // 2. Yêu cầu quyền truy cập vị trí (sẽ hiện popup như camera)
    navigator.geolocation.getCurrentPosition(
        async (position) => { // Thành công
            const { latitude, longitude } = position.coords;
            const latFixed = latitude.toFixed(4);
            const lngFixed = longitude.toFixed(4);
            locationText.innerHTML = `📍 ${latFixed}°, ${lngFixed}°`;
            locationText.style.cursor = 'pointer';
            locationText.title = 'Nhấn để cập nhật lại thời tiết';

            // 3. Gọi API thời tiết
            try {
                weatherText.innerHTML = '☁️ Đang lấy dữ liệu thời tiết...';
                const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
                const data = await response.json();
                
                if (data && data.current_weather) {
                    const condition = getWeatherCondition(data.current_weather.weathercode);
                    weatherText.innerHTML = `${condition.icon} ${condition.text}`;
                } else {
                    weatherText.innerHTML = '☁️ Không có dữ liệu';
                }
                // Cho phép click để refresh
                locationText.onclick = () => askForLocationAndWeather();
                weatherText.onclick = () => askForLocationAndWeather();
            } catch (error) {
                console.error("Lỗi API thời tiết:", error);
                weatherText.innerHTML = '☁️ Lỗi kết nối thời tiết';
            }
        },
        (error) => { // Thất bại (user từ chối hoặc lỗi)
            console.error("Lỗi vị trí:", error);
            let errorMsg = '';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '📍 Bị từ chối. Vui lòng bật GPS và tải lại trang.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '📍 Không xác định được vị trí.';
                    break;
                case error.TIMEOUT:
                    errorMsg = '📍 Quá thời gian chờ. Thử lại sau.';
                    break;
                default:
                    errorMsg = '📍 Không thể lấy vị trí.';
            }
            locationText.innerHTML = errorMsg;
            weatherText.innerHTML = '☁️ Cần vị trí để hiển thị thời tiết';
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Options
    );
}

// Cập nhật thời gian hiện tại
function updateCurrentTime() {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (timeText) {
        timeText.textContent = currentTime;
        timeText.style.cursor = 'pointer';
        timeText.title = 'Nhấn để cập nhật thời gian hiện tại';
        timeText.onclick = () => updateCurrentTime();
    }
}

// ========== HIỂN THỊ MODAL CHỈNH SỬA ==========
function showEditModal(imageBlobOrFile) {
    const url = URL.createObjectURL(imageBlobOrFile);
    previewImage.src = url;
    pendingImageFile = imageBlobOrFile;
    
    // Reset form
    commentInput.value = '';
    selectedRating = 0;
    updateStarDisplay();
    
    // Cập nhật thời gian hiện tại
    updateCurrentTime();
    
    // Luôn hỏi quyền vị trí và lấy thời tiết MỖI KHI mở modal
    askForLocationAndWeather();
    
    editModal.classList.remove('hidden');
}

function hideEditModal() {
    editModal.classList.add('hidden');
    if (previewImage.src) {
        URL.revokeObjectURL(previewImage.src);
    }
    pendingImageFile = null;
}

// ========== XỬ LÝ RATING STAR (có thể bỏ chọn) ==========
function updateStarDisplay() {
    starSpans.forEach((span, idx) => {
        if (idx < selectedRating) {
            span.classList.add('active');
            span.textContent = '★';
        } else {
            span.classList.remove('active');
            span.textContent = '☆';
        }
    });
}

starSpans.forEach(star => {
    star.addEventListener('click', (e) => {
        const value = parseInt(star.dataset.value);
        selectedRating = (selectedRating === value) ? 0 : value;
        updateStarDisplay();
        e.stopPropagation();
    });
});

// ========== GỬI ẢNH LÊN SUPABASE ==========
async function uploadPhotoWithMetadata(file, metadata) {
    try {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `photos/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('locket-media')
            .upload(filePath, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
            .from('locket-media')
            .getPublicUrl(filePath);
        
        const { error: dbError } = await supabase
            .from('media')
            .insert([{
                url: publicUrl,
                type: 'image',
                comment: metadata.comment || '',
                rating: metadata.rating || 0,
                weather: metadata.weather || '',
                location: metadata.location || '',
                time: metadata.time || '',
                created_at: new Date().toISOString()
            }]);
        
        if (dbError) throw dbError;
        
        alert('✅ Đã đăng ảnh!');
        loadPhotos();
        
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload thất bại: ' + error.message);
    }
}

// ========== XỬ LÝ KHI BẤM GỬI ==========
confirmSendBtn.onclick = async () => {
    if (!pendingImageFile) return;
    
    const metadata = {
        comment: commentInput.value,
        rating: selectedRating,
        weather: weatherText ? weatherText.innerHTML : '',
        location: locationText ? locationText.innerHTML : '',
        time: timeText ? timeText.textContent : ''
    };
    
    await uploadPhotoWithMetadata(pendingImageFile, metadata);
    hideEditModal();
};

cancelEditBtn.onclick = hideEditModal;
closeEditModal.onclick = hideEditModal;

// ========== MỞ CAMERA ==========
async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    try {
        const constraints = {
            video: {
                facingMode: { exact: currentFacing },
                width: { ideal: 3840, min: 1920 },
                height: { ideal: 2160, min: 1080 },
                frameRate: { ideal: 30 }
            }
        };
        
        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.warn('Fallback HD');
            constraints.video.width = { ideal: 1920, min: 1280 };
            constraints.video.height = { ideal: 1080, min: 720 };
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        cameraPreview.srcObject = currentStream;
        await cameraPreview.play();
        
        cameraScreen.setAttribute('data-facing', currentFacing);
        
    } catch (err) {
        console.error('Camera error:', err);
        alert('Không thể mở camera: ' + err.message);
    }
}

async function takePhoto() {
    if (!cameraPreview.videoWidth || !cameraPreview.videoHeight) {
        alert('Camera chưa sẵn sàng');
        return;
    }
    
    const width = cameraPreview.videoWidth;
    const height = cameraPreview.videoHeight;
    
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;
    
    const ctx = hiddenCanvas.getContext('2d');
    
    if (currentFacing === 'user') {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(cameraPreview, 0, 0, width, height);
        ctx.restore();
    } else {
        ctx.drawImage(cameraPreview, 0, 0, width, height);
    }
    
    hiddenCanvas.toBlob(async (blob) => {
        if (!blob) {
            alert('Chụp ảnh thất bại');
            return;
        }
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        closeCameraScreen();
        showEditModal(file);
    }, 'image/jpeg', 0.95);
}

// ========== HIỂN THỊ ẢNH ==========
async function loadPhotos() {
    try {
        const { data, error } = await supabase
            .from('media')
            .select('*')
            .eq('type', 'image')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            imageGrid.innerHTML = '<div class="loading">📭 Chưa có ảnh nào</div>';
            if (photoCount) photoCount.textContent = '';
            return;
        }
        
        if (photoCount) photoCount.textContent = `${data.length} ảnh`;
        
        imageGrid.innerHTML = data.map(item => `
            <div class="image-item" onclick="window.open('${item.url}', '_blank')">
                <img src="${item.url}" alt="photo" loading="lazy">
                ${item.comment ? `<div class="image-comment">💬 ${item.comment.substring(0, 20)}</div>` : ''}
                ${item.rating > 0 ? `<div class="image-rating">${'★'.repeat(item.rating)}</div>` : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Load error:', error);
        imageGrid.innerHTML = '<div class="loading">❌ Lỗi tải ảnh</div>';
    }
}

// ========== UPLOAD TỪ FILE ==========
function uploadFromFile() {
    fileUpload.click();
}

fileUpload.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Chỉ chấp nhận file ảnh');
        return;
    }
    showEditModal(file);
    fileUpload.value = '';
};

// ========== ĐÓNG/MỞ CAMERA ==========
function openCameraScreen() {
    cameraScreen.classList.remove('hidden');
    startCamera();
}

function closeCameraScreen() {
    cameraScreen.classList.add('hidden');
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    cameraPreview.srcObject = null;
}

function switchCameraMode() {
    currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
    startCamera();
}

// ========== REAL-TIME ==========
function setupRealtime() {
    supabase
        .channel('photos')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'media' },
            () => loadPhotos()
        )
        .subscribe();
}

// ========== GÁN SỰ KIỆN ==========
if (openCameraBtn) openCameraBtn.onclick = openCameraScreen;
if (closeCamera) closeCamera.onclick = closeCameraScreen;
if (takePhotoBtn) takePhotoBtn.onclick = takePhoto;
if (switchCamera) switchCamera.onclick = switchCameraMode;
if (uploadImageBtn) uploadImageBtn.onclick = uploadFromFile;

// ========== KHỞI ĐỘNG ==========
loadPhotos();
setupRealtime();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.log);
}

window.open = window.open.bind(window);