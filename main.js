import { createClient } from '@supabase/supabase-js';

// Lấy config từ .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
const cameraBtn = document.getElementById('cameraBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const gallery = document.getElementById('gallery');
const cameraPreview = document.getElementById('cameraPreview');
const videoElement = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const urlDisplay = document.getElementById('urlDisplay');

// State
let stream = null;
let currentFacingMode = 'environment'; // 'environment' = cam sau, 'user' = cam trước

// Hiển thị URL
urlDisplay.textContent = window.location.href;
copyUrlBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href);
  alert('✅ Đã sao chép link! Gửi cho bạn bè để cùng xem.');
});

// ========== 1. KHỞI TẠO CAMERA VỚI ĐỘ PHÂN GIẢI CAO NHẤT ==========
async function initCamera() {
  try {
    // Dừng stream cũ nếu có
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Cấu hình độ phân giải tối đa (4K/HD)
    const constraints = {
      video: {
        facingMode: { exact: currentFacingMode },
        width: { ideal: 3840, min: 1920 },
        height: { ideal: 2160, min: 1080 },
        frameRate: { ideal: 60 }
      }
    };
    
    // Thử với độ phân giải cao nhất
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Nếu không hỗ trợ 4K, fallback xuống HD
      console.warn('Không hỗ trợ 4K, fallback xuống HD:', err);
      constraints.video.width = { ideal: 1920 };
      constraints.video.height = { ideal: 1080 };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    
    // Gán stream vào video element
    videoElement.srcObject = stream;
    
    // Đợi video load xong
    await videoElement.play();
    
    // Fix lỗi lệch cam - áp dụng CSS transform
    if (currentFacingMode === 'user') {
      // Cam trước: lật ngang để đúng chiều
      videoElement.style.transform = 'scaleX(-1)';
    } else {
      videoElement.style.transform = 'scaleX(1)';
    }
    
    // Đảm bảo video chiếm toàn bộ khung hình
    videoElement.style.objectFit = 'cover';
    videoElement.style.width = '100%';
    videoElement.style.height = 'auto';
    
    console.log('Camera initialized with mode:', currentFacingMode);
    
  } catch (error) {
    console.error('Lỗi khởi tạo camera:', error);
    alert('❌ Không thể truy cập camera: ' + error.message);
    throw error;
  }
}

// ========== 2. CHỤP ẢNH VỚI CHẤT LƯỢNG CAO NHẤT ==========
async function capturePhoto() {
  try {
    // Đảm bảo video đã sẵn sàng
    if (!videoElement.videoWidth || !videoElement.videoHeight) {
      alert('❌ Camera chưa sẵn sàng. Vui lòng đợi 1 giây.');
      return;
    }
    
    // Set canvas đúng kích thước video
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const context = canvas.getContext('2d');
    
    // Vẽ ảnh từ video lên canvas
    if (currentFacingMode === 'user') {
      // Cam trước: cần lật ảnh lại khi vẽ
      context.save();
      context.scale(-1, 1);
      context.drawImage(videoElement, -canvas.width, 0, canvas.width, canvas.height);
      context.restore();
    } else {
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    }
    
    // Chuyển canvas thành blob với chất lượng cao nhất
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.95);
    });
    
    if (!blob) {
      throw new Error('Không thể tạo ảnh');
    }
    
    // Tạo file từ blob
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    
    // Hiển thị preview trước khi upload
    const previewUrl = URL.createObjectURL(blob);
    console.log('Ảnh đã chụp, kích thước:', canvas.width, 'x', canvas.height);
    
    // Upload lên Supabase
    await uploadFile(file, 'image');
    
    // Cleanup preview URL
    URL.revokeObjectURL(previewUrl);
    
  } catch (error) {
    console.error('Lỗi chụp ảnh:', error);
    alert('❌ Chụp ảnh thất bại: ' + error.message);
  }
}

// ========== 3. UPLOAD FILE LÊN SUPABASE ==========
async function uploadFile(file, type) {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `media/${fileName}`;
    
    console.log('Đang upload:', fileName, type, 'Size:', file.size);
    
    // Upload lên Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('locket-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) throw uploadError;
    
    // Lấy public URL
    const { data: { publicUrl } } = supabase.storage
      .from('locket-media')
      .getPublicUrl(filePath);
    
    // Lưu vào Database
    const { error: dbError } = await supabase
      .from('media')
      .insert([
        {
          url: publicUrl,
          type: type,
          file_name: fileName,
          created_at: new Date().toISOString()
        }
      ]);
    
    if (dbError) throw dbError;
    
    console.log('Upload thành công!');
    alert('✅ Đã lưu ảnh! Mọi người có thể xem ngay.');
    
    // Reload gallery
    await loadMedia();
    
    return publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    alert('❌ Upload thất bại: ' + error.message);
    return null;
  }
}

// ========== 4. HIỂN THỊ GALLERY ==========
async function loadMedia() {
  try {
    console.log('Đang tải media...');
    
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      gallery.innerHTML = '<div class="loading">📭 Chưa có ảnh/video nào. Hãy upload lên nhé!</div>';
      return;
    }
    
    gallery.innerHTML = data.map(item => `
      <div class="gallery-item" onclick="window.open('${item.url}', '_blank')">
        ${item.type === 'video' 
          ? `<video src="${item.url}" controls preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>` 
          : `<img src="${item.url}" alt="Shared media" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://placehold.co/400x400/ff0000/white?text=Error'">`
        }
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Load error:', error);
    gallery.innerHTML = `<div class="loading">❌ Lỗi: ${error.message}</div>`;
  }
}

// ========== 5. REAL-TIME ==========
function setupRealtime() {
  supabase
    .channel('media_changes')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'media' },
      (payload) => {
        console.log('Có ảnh mới!');
        loadMedia(); // Reload toàn bộ gallery
      }
    )
    .subscribe();
}

// ========== 6. XỬ LÝ UPLOAD FILE ==========
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const type = file.type.startsWith('video/') ? 'video' : 'image';
  await uploadFile(file, type);
  fileInput.value = '';
});

// ========== 7. MỞ CAMERA ==========
cameraBtn.addEventListener('click', async () => {
  cameraPreview.classList.remove('hidden');
  await initCamera();
});

// ========== 8. CHỤP ẢNH ==========
captureBtn.addEventListener('click', async () => {
  await capturePhoto();
});

// ========== 9. ĐÓNG CAMERA ==========
function closeCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  cameraPreview.classList.add('hidden');
  videoElement.srcObject = null;
}

closeCameraBtn.addEventListener('click', closeCamera);

// ========== 10. CHUYỂN ĐỔI CAM SAU/TRƯỚC ==========
// Thêm nút chuyển đổi camera (tạo thêm trong HTML nếu cần)
function addSwitchCameraButton() {
  const cameraControls = document.querySelector('.camera-controls');
  if (cameraControls && !document.getElementById('switchCameraBtn')) {
    const switchBtn = document.createElement('button');
    switchBtn.id = 'switchCameraBtn';
    switchBtn.textContent = '🔄 Đổi cam';
    switchBtn.className = 'switch-cam-btn';
    switchBtn.style.cssText = 'background: #4a90e2; color: white; padding: 14px 24px; border: none; border-radius: 40px; font-size: 18px; cursor: pointer;';
    switchBtn.onclick = async () => {
      // Chuyển đổi giữa cam trước và cam sau
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      await initCamera();
    };
    cameraControls.appendChild(switchBtn);
  }
}

// Gọi hàm này khi DOM load xong
setTimeout(addSwitchCameraButton, 100);

// ========== 11. KHỞI ĐỘNG APP ==========
async function init() {
  console.log('🚀 Khởi động Locket Clone...');
  await loadMedia();
  setupRealtime();
}

init();

// PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.log);
}

window.open = window.open.bind(window);