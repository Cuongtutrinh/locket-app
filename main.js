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
let pendingImageFile = null; // Ảnh tạm thời chờ gửi
let selectedRating = 0;

// Hiển thị URL
urlText.textContent = window.location.href;
copyBtn.onclick = () => {
  navigator.clipboard.writeText(window.location.href);
  alert('✅ Đã copy link!');
};

// ========== LẤY THÔNG TIN THỜI TIẾT & VỊ TRÍ ==========
async function getLocationAndWeather() {
  // Lấy thời gian hiện tại
  const now = new Date();
  timeText.textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  
  // Lấy vị trí
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      locationText.textContent = `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
      
      // Gọi API thời tiết (OpenWeatherMap - cần API key)
      try {
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
        const weatherData = await weatherRes.json();
        const temp = weatherData.current_weather.temperature;
        const weatherCode = weatherData.current_weather.weathercode;
        
        tempText.textContent = `${Math.round(temp)}°C`;
        
        // Mã thời tiết Open-Meteo
        const weatherMap = {
          0: '☀️ Nắng', 1: '🌤️ Ít mây', 2: '⛅ Có mây', 3: '☁️ Nhiều mây',
          45: '🌫️ Sương mù', 51: '🌧️ Mưa nhẹ', 61: '🌧️ Mưa', 71: '❄️ Tuyết'
        };
        weatherText.textContent = weatherMap[weatherCode] || '🌡️ Bình thường';
      } catch (err) {
        weatherText.textContent = '🌡️ Không xác định';
        tempText.textContent = '--°C';
      }
    }, () => {
      locationText.textContent = 'Không xác định';
      weatherText.textContent = '--';
      tempText.textContent = '--°C';
    });
  } else {
    locationText.textContent = 'Không hỗ trợ';
  }
}

// ========== HIỂN THỊ MODAL CHỈNH SỬA ==========
function showEditModal(imageBlobOrFile) {
  // Tạo URL preview
  const url = URL.createObjectURL(imageBlobOrFile);
  previewImage.src = url;
  pendingImageFile = imageBlobOrFile;
  
  // Reset form
  commentInput.value = '';
  selectedRating = 0;
  starSpans.forEach(span => span.classList.remove('active'));
  
  // Lấy thông tin hiện tại
  getLocationAndWeather();
  
  // Hiển thị modal
  editModal.classList.remove('hidden');
}

function hideEditModal() {
  editModal.classList.add('hidden');
  if (previewImage.src) {
    URL.revokeObjectURL(previewImage.src);
  }
  pendingImageFile = null;
}

// ========== XỬ LÝ RATING STAR ==========
starSpans.forEach(star => {
  star.addEventListener('click', () => {
    selectedRating = parseInt(star.dataset.value);
    starSpans.forEach((s, idx) => {
      if (idx < selectedRating) {
        s.classList.add('active');
        s.textContent = '★';
      } else {
        s.classList.remove('active');
        s.textContent = '☆';
      }
    });
  });
});

// ========== GỬI ẢNH LÊN SUPABASE (kèm metadata) ==========
async function uploadPhotoWithMetadata(file, metadata) {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `photos/${fileName}`;
    
    // Upload lên Storage
    const { error: uploadError } = await supabase.storage
      .from('locket-media')
      .upload(filePath, file);
    
    if (uploadError) throw uploadError;
    
    // Lấy public URL
    const { data: { publicUrl } } = supabase.storage
      .from('locket-media')
      .getPublicUrl(filePath);
    
    // Lưu vào database với đầy đủ metadata
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
    weather: weatherText.textContent,
    temperature: tempText.textContent,
    location: locationText.textContent,
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
    
    // Đóng camera và hiện modal chỉnh sửa
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
      photoCount.textContent = '';
      return;
    }
    
    photoCount.textContent = `${data.length} ảnh`;
    
    imageGrid.innerHTML = data.map(item => `
      <div class="image-item" onclick="window.open('${item.url}', '_blank')">
        <img src="${item.url}" alt="photo">
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
openCameraBtn.onclick = openCameraScreen;
closeCamera.onclick = closeCameraScreen;
takePhotoBtn.onclick = takePhoto;
switchCamera.onclick = switchCameraMode;
uploadImageBtn.onclick = uploadFromFile;

// ========== KHỞI ĐỘNG ==========
loadPhotos();
setupRealtime();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

window.open = window.open.bind(window);