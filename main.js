import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
const openCameraBtn = document.getElementById('openCameraBtn');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const fileUpload = document.getElementById('fileUpload');
const imageGrid = document.getElementById('imageGrid');
const cameraScreen = document.getElementById('cameraScreen');
const cameraPreview = document.getElementById('cameraPreview');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const closeCamera = document.getElementById('closeCamera');
const switchCamera = document.getElementById('switchCamera');
const hiddenCanvas = document.getElementById('hiddenCanvas');
const copyBtn = document.getElementById('copyBtn');
const urlText = document.getElementById('urlText');

// State
let currentStream = null;
let currentFacing = 'environment'; // 'environment' (sau) hoặc 'user' (trước)


// ========== MỞ CAMERA ==========
async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
  
  try {
    // Cấu hình độ phân giải CAO NHẤT có thể
    const constraints = {
      video: {
        facingMode: { exact: currentFacing },
        width: { ideal: 3840, min: 1920 },  // 4K hoặc ít nhất Full HD
        height: { ideal: 2160, min: 1080 },
        frameRate: { ideal: 30 }
      }
    };
    
    // Thử với độ phân giải cao nhất
    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Nếu không hỗ trợ 4K, fallback xuống Full HD
      console.warn('Không hỗ trợ 4K, fallback xuống Full HD');
      constraints.video.width = { ideal: 1920, min: 1280 };
      constraints.video.height = { ideal: 1080, min: 720 };
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    
    cameraPreview.srcObject = currentStream;
    await cameraPreview.play();
    
    // Log độ phân giải thực tế
    console.log('Video track settings:', currentStream.getVideoTracks()[0].getSettings());
    console.log(`Độ phân giải: ${cameraPreview.videoWidth} x ${cameraPreview.videoHeight}`);
    
    // Thêm attribute để CSS xử lý lật video
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

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  cameraPreview.srcObject = null;
}

// ========== CHỤP ẢNH ==========
async function takePhoto() {
  if (!cameraPreview.videoWidth || !cameraPreview.videoHeight) {
    alert('Camera chưa sẵn sàng');
    return;
  }
  
  // Lấy kích thước THỰC TẾ của video (sẽ là HD/4K)
  const width = cameraPreview.videoWidth;
  const height = cameraPreview.videoHeight;
  
  console.log(`Chụp ảnh với độ phân giải: ${width} x ${height}`);
  
  hiddenCanvas.width = width;
  hiddenCanvas.height = height;
  
  const ctx = hiddenCanvas.getContext('2d');
  
  // Vẽ ảnh từ camera với chất lượng cao nhất
  if (currentFacing === 'user') {
    // Cam trước: lật ngang
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cameraPreview, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(cameraPreview, 0, 0, width, height);
  }
  
  // Chuyển thành file với chất lượng tối đa (1.0 = 100%)
  hiddenCanvas.toBlob(async (blob) => {
    if (!blob) {
      alert('Chụp ảnh thất bại');
      return;
    }
    
    console.log(`Kích thước ảnh: ${(blob.size / 1024).toFixed(2)} KB`);
    
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    await uploadPhoto(file);
    closeCameraScreen();
    
  }, 'image/jpeg', 1.0); // Chất lượng tối đa
}

// ========== UPLOAD ẢNH LÊN SUPABASE ==========
async function uploadPhoto(file) {
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
    
    // Lưu vào database
    const { error: dbError } = await supabase
      .from('media')
      .insert([{
        url: publicUrl,
        type: 'image',
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
      return;
    }
    
    imageGrid.innerHTML = data.map(item => `
      <img src="${item.url}" alt="photo" onclick="window.open('${item.url}', '_blank')">
    `).join('');
    
  } catch (error) {
    console.error('Load error:', error);
    imageGrid.innerHTML = '<div class="loading">Lỗi tải ảnh</div>';
  }
}

// ========== ĐÓNG/MỞ CAMERA ==========
function openCameraScreen() {
  cameraScreen.classList.remove('hidden');
  startCamera();
}

function closeCameraScreen() {
  cameraScreen.classList.add('hidden');
  stopCamera();
}

// ========== ĐỔI CAM TRƯỚC/SAU ==========
function switchCameraMode() {
  currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
  startCamera();
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
  
  await uploadPhoto(file);
  fileUpload.value = '';
};

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

// Kiểm tra camera hỗ trợ độ phân giải nào
async function checkCameraCapabilities() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');
  
  console.log('Camera devices:', videoDevices);
  
  for (const device of videoDevices) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: device.deviceId }
      });
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      console.log(`Camera ${device.label} capabilities:`, capabilities);
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error('Error checking camera:', err);
    }
  }
}

// Gọi hàm này khi load để debug
checkCameraCapabilities();

// ========== GÁN SỰ KIỆN ==========
openCameraBtn.onclick = openCameraScreen;
closeCamera.onclick = closeCameraScreen;
takePhotoBtn.onclick = takePhoto;
switchCamera.onclick = switchCameraMode;
uploadImageBtn.onclick = uploadFromFile;

// ========== KHỞI ĐỘNG ==========
loadPhotos();
setupRealtime();

// Service Worker (PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

window.open = window.open.bind(window);