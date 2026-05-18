import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
const openCameraBtn = document.getElementById('openCameraBtn');
const uploadVideoBtn = document.getElementById('uploadVideoBtn');
const fileUpload = document.getElementById('fileUpload');
const videoGrid = document.getElementById('videoGrid');
const cameraScreen = document.getElementById('cameraScreen');
const cameraPreview = document.getElementById('cameraPreview');
const recordBtn = document.getElementById('recordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const closeCamera = document.getElementById('closeCamera');
const switchCamera = document.getElementById('switchCamera');
const timerDisplay = document.getElementById('timerDisplay');
const copyBtn = document.getElementById('copyBtn');
const urlText = document.getElementById('urlText');

// State
let currentStream = null;
let currentFacing = 'environment';
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let timerInterval = null;
let isRecording = false;

// Hiển thị URL
urlText.textContent = window.location.href;
copyBtn.onclick = () => {
  navigator.clipboard.writeText(window.location.href);
  alert('✅ Đã copy link!');
};

// ========== MỞ CAMERA VỚI ĐỘ PHÂN GIẢI CAO ==========
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
      },
      audio: true  // Cần audio cho video
    };
    
    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('Không hỗ trợ 4K, fallback xuống Full HD');
      constraints.video.width = { ideal: 1920, min: 1280 };
      constraints.video.height = { ideal: 1080, min: 720 };
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    
    cameraPreview.srcObject = currentStream;
    await cameraPreview.play();
    
    const settings = currentStream.getVideoTracks()[0].getSettings();
    console.log(`📹 Độ phân giải video: ${settings.width} x ${settings.height}`);
    
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

// ========== TIMER ==========
function startTimer() {
  recordingStartTime = Date.now();
  timerDisplay.classList.remove('hidden');
  
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerDisplay.classList.add('hidden');
  timerDisplay.textContent = '0:00';
}

// ========== BẮT ĐẦU QUAY VIDEO ==========
async function startRecording() {
  if (!currentStream) {
    alert('Camera chưa sẵn sàng');
    return;
  }
  
  recordedChunks = [];
  
  // Kiểm tra codec hỗ trợ
  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  
  let mimeType = '';
  for (const type of mimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      mimeType = type;
      break;
    }
  }
  
  try {
    mediaRecorder = new MediaRecorder(currentStream, {
      mimeType: mimeType,
      videoBitsPerSecond: 25000000 // 25 Mbps cho chất lượng cao
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      await saveVideo();
    };
    
    mediaRecorder.start(1000); // Ghi mỗi giây
    isRecording = true;
    
    // Đổi UI khi đang quay
    recordBtn.classList.add('hidden');
    stopRecordBtn.classList.remove('hidden');
    startTimer();
    
    console.log('🎥 Bắt đầu quay video...');
    
  } catch (err) {
    console.error('Lỗi khi quay video:', err);
    alert('Không thể quay video: ' + err.message);
  }
}

// ========== DỪNG QUAY ==========
function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    
    // Đổi UI
    recordBtn.classList.remove('hidden');
    stopRecordBtn.classList.add('hidden');
    stopTimer();
    
    console.log('⏹️ Dừng quay video');
  }
}

// ========== LƯU VIDEO ==========
async function saveVideo() {
  if (recordedChunks.length === 0) {
    alert('Không có dữ liệu video');
    return;
  }
  
  const blob = new Blob(recordedChunks, { type: 'video/mp4' });
  const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
  
  console.log(`📹 Video size: ${(blob.size / 1024 / 1024).toFixed(2)} MB, Duration: ${duration}s`);
  
  // Tạo file từ blob
  const file = new File([blob], `video_${Date.now()}.mp4`, { type: 'video/mp4' });
  await uploadVideo(file, duration);
  
  closeCameraScreen();
}

// ========== UPLOAD VIDEO LÊN SUPABASE ==========
async function uploadVideo(file, duration) {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `videos/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('locket-media')
      .upload(filePath, file, {
        contentType: 'video/mp4',
        cacheControl: '3600'
      });
    
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = supabase.storage
      .from('locket-media')
      .getPublicUrl(filePath);
    
    const { error: dbError } = await supabase
      .from('media')
      .insert([{
        url: publicUrl,
        type: 'video',
        duration: duration,
        created_at: new Date().toISOString()
      }]);
    
    if (dbError) throw dbError;
    
    alert('✅ Đã đăng video!');
    loadVideos();
    
  } catch (error) {
    console.error('Upload error:', error);
    alert('Upload thất bại: ' + error.message);
  }
}

// ========== HIỂN THỊ VIDEO ==========
async function loadVideos() {
  try {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .eq('type', 'video')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      videoGrid.innerHTML = '<div class="loading">📭 Chưa có video nào</div>';
      return;
    }
    
    videoGrid.innerHTML = data.map(item => `
      <div class="video-item" onclick="window.open('${item.url}', '_blank')">
        <video src="${item.url}" preload="metadata"></video>
        <span class="duration">${formatDuration(item.duration || 0)}</span>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Load error:', error);
    videoGrid.innerHTML = '<div class="loading">❌ Lỗi tải video</div>';
  }
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ========== UPLOAD TỪ FILE ==========
function uploadFromFile() {
  fileUpload.click();
}

fileUpload.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('video/')) {
    alert('❌ Chỉ chấp nhận file video');
    return;
  }
  
  // Ước tính duration cho file upload
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = URL.createObjectURL(file);
  
  video.onloadedmetadata = async () => {
    const duration = Math.floor(video.duration);
    URL.revokeObjectURL(video.src);
    await uploadVideo(file, duration);
    fileUpload.value = '';
  };
};

// ========== ĐÓNG/MỞ CAMERA ==========
function openCameraScreen() {
  cameraScreen.classList.remove('hidden');
  startCamera();
}

function closeCameraScreen() {
  if (isRecording) {
    stopRecording();
  }
  cameraScreen.classList.add('hidden');
  stopCamera();
}

function switchCameraMode() {
  if (isRecording) {
    alert('Vui lòng dừng quay trước khi đổi camera');
    return;
  }
  currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
  startCamera();
}

// ========== REAL-TIME ==========
function setupRealtime() {
  supabase
    .channel('videos')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'media' },
      () => loadVideos()
    )
    .subscribe();
}

// ========== GÁN SỰ KIỆN ==========
openCameraBtn.onclick = openCameraScreen;
closeCamera.onclick = closeCameraScreen;
recordBtn.onclick = startRecording;
stopRecordBtn.onclick = stopRecording;
switchCamera.onclick = switchCameraMode;
uploadVideoBtn.onclick = uploadFromFile;

// ========== KHỞI ĐỘNG ==========
loadVideos();
setupRealtime();

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

window.open = window.open.bind(window);