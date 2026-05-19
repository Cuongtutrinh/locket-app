import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
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
const tempText = document.getElementById('tempText');
const timeText = document.getElementById('timeText');
const locationText = document.getElementById('locationText');
const closeEditModal = document.getElementById('closeEditModal');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const confirmSendBtn = document.getElementById('confirmSendBtn');

// State
let currentStream = null;
let currentFacing = 'environment';
let pendingImageFile = null;
let selectedRating = 0;
let currentLocation = { lat: null, lng: null };
let currentWeatherData = { temp: null, code: null, condition: 'Đang tải...' };

// ========== LẤY VỊ TRÍ ==========
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject('Trình duyệt không hỗ trợ định vị');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  });
}

// ========== LẤY THỜI TIẾT ==========
async function fetchWeather(lat, lon) {
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const data = await response.json();
    return {
      temp: Math.round(data.current_weather.temperature),
      code: data.current_weather.weathercode
    };
  } catch (error) {
    console.error('Lỗi lấy thời tiết:', error);
    return null;
  }
}

// Hàm chuyển mã thời tiết thành text + icon
function getWeatherCondition(code) {
  const weatherMap = {
    0: { icon: '☀️', text: 'Nắng' },
    1: { icon: '🌤️', text: 'Ít mây' },
    2: { icon: '⛅', text: 'Có mây' },
    3: { icon: '☁️', text: 'Nhiều mây' },
    45: { icon: '🌫️', text: 'Sương mù' },
    48: { icon: '🌫️', text: 'Sương mù' },
    51: { icon: '🌧️', text: 'Mưa nhẹ' },
    53: { icon: '🌧️', text: 'Mưa' },
    55: { icon: '🌧️', text: 'Mưa lớn' },
    61: { icon: '🌧️', text: 'Mưa' },
    63: { icon: '🌧️', text: 'Mưa vừa' },
    65: { icon: '🌧️', text: 'Mưa lớn' },
    71: { icon: '❄️', text: 'Tuyết' },
    73: { icon: '❄️', text: 'Tuyết vừa' },
    75: { icon: '❄️', text: 'Tuyết lớn' },
    80: { icon: '🌧️', text: 'Mưa rào' },
    95: { icon: '⛈️', text: 'Giông bão' }
  };
  return weatherMap[code] || { icon: '🌡️', text: 'Bình thường' };
}

// ========== CẬP NHẬT THÔNG TIN THỜI TIẾT & VỊ TRÍ ==========
async function updateWeatherAndLocation() {
  // Thời gian hiện tại - có thể chọn lại
  const now = new Date();
  const currentTime = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  timeText.textContent = currentTime;
  timeText.style.cursor = 'pointer';
  timeText.title = 'Click để cập nhật thời gian hiện tại';
  
  // Cho phép click để refresh thời gian
  timeText.onclick = () => {
    const newTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    timeText.textContent = newTime;
  };
  
  try {
    const position = await getLocation();
    currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
    
    // Hiển thị vị trí dạng đẹp hơn
    locationText.innerHTML = `📍 ${currentLocation.lat.toFixed(3)}°, ${currentLocation.lng.toFixed(3)}°`;
    locationText.style.cursor = 'pointer';
    locationText.title = 'Click để lấy lại vị trí';
    locationText.onclick = () => {
      updateWeatherAndLocation();
    };
    
    const weather = await fetchWeather(currentLocation.lat, currentLocation.lng);
    if (weather) {
      currentWeatherData = weather;
      const condition = getWeatherCondition(weather.code);
      weatherText.innerHTML = `${condition.icon} ${condition.text}`;
      tempText.innerHTML = `🌡️ ${weather.temp}°C`;
      
      // Cho phép click để refresh thời tiết
      weatherText.style.cursor = 'pointer';
      tempText.style.cursor = 'pointer';
      weatherText.onclick = () => updateWeatherAndLocation();
      tempText.onclick = () => updateWeatherAndLocation();
    } else {
      weatherText.innerHTML = '🌡️ Không xác định';
      tempText.innerHTML = '🌡️ --°C';
    }
  } catch (error) {
    console.error('Lỗi lấy vị trí:', error);
    locationText.innerHTML = '📍 Không xác định (cần bật GPS)';
    weatherText.innerHTML = '🌡️ Không xác định';
    tempText.innerHTML = '🌡️ --°C';
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
  
  // Cập nhật thông tin
  updateWeatherAndLocation();
  
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
    
    // Nếu click vào sao đang được chọn thì bỏ chọn (set về 0)
    if (selectedRating === value) {
      selectedRating = 0;
    } else {
      selectedRating = value;
    }
    
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
        temperature: metadata.temperature || '',
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
    weather: weatherText.innerHTML,
    temperature: tempText.innerHTML,
    location: locationText.innerHTML,
    time: timeText.textContent
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
    
    if (currentFacing === 'user') {
      cameraScreen.setAttribute('data-facing', 'user');
    } else {
      cameraScreen.setAttribute('data-facing', 'environment');
    }
    
  } catch (err) {
    console.error('Camera error:', err);
    alert('Không thể mở camera: ' + err.message);
  }
}

// ========== CHỤP ẢNH ==========
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