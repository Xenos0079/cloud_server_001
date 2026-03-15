// Socket连接
const socket = io();

// Canvas相关
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let currentTool = 'brush'; // 'brush' 或 'eraser'
let currentRole = null; // 'painter' 或 'guesser'

// 擦除器相关
let isErasing = false;
let eraseStartX = 0;
let eraseStartY = 0;
let erasePreviewX = 0;
let erasePreviewY = 0;
let erasePreviewWidth = 0;
let erasePreviewHeight = 0;
let canvasSnapshot = null; // 保存画布快照用于预览

// UI元素
const statusEl = document.getElementById('status');
const toolbarEl = document.getElementById('toolbar');
const brushToolBtn = document.getElementById('brushTool');
const eraserToolBtn = document.getElementById('eraserTool');
const clearCanvasBtn = document.getElementById('clearCanvas');
const submitDrawingBtn = document.getElementById('submitDrawing');
const guessSectionEl = document.getElementById('guessSection');
const guessInputEl = document.getElementById('guessInput');
const submitGuessBtn = document.getElementById('submitGuess');
const receivedImageContainerEl = document.getElementById('receivedImageContainer');
const receivedImageEl = document.getElementById('receivedImage');
const gameResultEl = document.getElementById('gameResult');
const resultTextEl = document.getElementById('resultText');
const wordInputSectionEl = document.getElementById('wordInputSection');
const wordInputEl = document.getElementById('wordInput');
const setWordBtn = document.getElementById('setWord');

// 初始化Canvas
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.strokeStyle = 'black';
ctx.lineWidth = 2;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// 工具按钮事件
brushToolBtn.addEventListener('click', () => {
    currentTool = 'brush';
    canvas.style.cursor = 'crosshair';
    brushToolBtn.classList.add('bg-blue-700');
    eraserToolBtn.classList.remove('bg-red-700');
});

eraserToolBtn.addEventListener('click', () => {
    currentTool = 'eraser';
    canvas.style.cursor = 'crosshair';
    eraserToolBtn.classList.add('bg-red-700');
    brushToolBtn.classList.remove('bg-blue-700');
});

clearCanvasBtn.addEventListener('click', () => {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
});

submitDrawingBtn.addEventListener('click', () => {
    if (currentRole === 'painter') {
        const imageData = canvas.toDataURL('image/png');
        socket.emit('submit_drawing', { image: imageData });
        updateStatus('绘画已提交，等待猜测...');
        submitDrawingBtn.disabled = true;
    }
});

submitGuessBtn.addEventListener('click', () => {
    const guess = guessInputEl.value.trim();
    if (guess && currentRole === 'guesser') {
        socket.emit('check_guess', { guess: guess });
        guessInputEl.disabled = true;
        submitGuessBtn.disabled = true;
    }
});

setWordBtn.addEventListener('click', () => {
    const word = wordInputEl.value.trim();
    if (word && currentRole === 'painter') {
        socket.emit('set_word', { word: word });
        updateStatus(`单词已设置为: ${word}`);
    }
});

// Canvas鼠标事件 - 画笔工具
canvas.addEventListener('mousedown', (e) => {
    if (currentRole !== 'painter') return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === 'brush') {
        isDrawing = true;
        ctx.beginPath();
        ctx.moveTo(x, y);
    } else if (currentTool === 'eraser') {
        isErasing = true;
        eraseStartX = x;
        eraseStartY = y;
        erasePreviewX = x;
        erasePreviewY = y;
        erasePreviewWidth = 0;
        erasePreviewHeight = 0;
        // 保存当前画布状态
        canvasSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (currentRole !== 'painter') return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === 'brush' && isDrawing) {
        ctx.lineTo(x, y);
        ctx.stroke();
    } else if (currentTool === 'eraser' && isErasing) {
        // 更新预览框
        erasePreviewX = Math.min(eraseStartX, x);
        erasePreviewY = Math.min(eraseStartY, y);
        erasePreviewWidth = Math.abs(x - eraseStartX);
        erasePreviewHeight = Math.abs(y - eraseStartY);
        
        // 恢复画布状态（清除之前的预览框）
        if (canvasSnapshot) {
            ctx.putImageData(canvasSnapshot, 0, 0);
        }
        
        // 绘制虚线预览框
        drawErasePreview();
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (currentRole !== 'painter') return;
    
    if (currentTool === 'brush' && isDrawing) {
        isDrawing = false;
    } else if (currentTool === 'eraser' && isErasing) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 执行擦除
        const eraseX = Math.min(eraseStartX, x);
        const eraseY = Math.min(eraseStartY, y);
        const eraseWidth = Math.abs(x - eraseStartX);
        const eraseHeight = Math.abs(y - eraseStartY);
        
        // 清除矩形区域
        ctx.clearRect(eraseX, eraseY, eraseWidth, eraseHeight);
        
        // 用白色填充（因为clearRect是透明）
        ctx.fillStyle = 'white';
        ctx.fillRect(eraseX, eraseY, eraseWidth, eraseHeight);
        
        isErasing = false;
        erasePreviewWidth = 0;
        erasePreviewHeight = 0;
        canvasSnapshot = null;
    }
});

canvas.addEventListener('mouseleave', () => {
    if (isDrawing) {
        isDrawing = false;
    }
    if (isErasing) {
        // 恢复画布状态
        if (canvasSnapshot) {
            ctx.putImageData(canvasSnapshot, 0, 0);
        }
        isErasing = false;
        erasePreviewWidth = 0;
        erasePreviewHeight = 0;
        canvasSnapshot = null;
    }
});

// 绘制擦除预览框（虚线矩形）
function drawErasePreview() {
    if (erasePreviewWidth > 0 && erasePreviewHeight > 0) {
        ctx.save();
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(erasePreviewX, erasePreviewY, erasePreviewWidth, erasePreviewHeight);
        ctx.restore();
    }
}

// Socket事件处理
socket.on('connect', () => {
    console.log('已连接到服务器');
    socket.emit('join');
});

socket.on('role_assigned', (data) => {
    currentRole = data.role;
    updateUIForRole(data.role);
    if (data.role === 'painter') {
        updateStatus('你是绘画者，开始绘画吧！');
    } else {
        updateStatus('你是猜测者，等待绘画...');
    }
});

socket.on('player_joined', () => {
    if (currentRole === 'painter') {
        updateStatus('玩家已加入，可以开始绘画了！');
    }
});

socket.on('game_full', () => {
    updateStatus('游戏已满，请稍后再试');
});

socket.on('drawing_received', (data) => {
    if (currentRole === 'guesser') {
        receivedImageEl.src = data.image;
        receivedImageContainerEl.classList.remove('hidden');
        guessSectionEl.classList.remove('hidden');
        updateStatus('绘画已收到，请开始猜测！');
    }
});

socket.on('game_result', (data) => {
    gameResultEl.classList.remove('hidden');
    if (data.correct) {
        resultTextEl.textContent = `恭喜！答案正确：${data.correctWord}`;
        resultTextEl.className = 'text-xl font-bold text-green-600';
        gameResultEl.className = 'text-center p-4 rounded-lg mb-4 bg-green-100';
    } else {
        resultTextEl.textContent = `很遗憾，答案错误。正确答案是：${data.correctWord}`;
        resultTextEl.className = 'text-xl font-bold text-red-600';
        gameResultEl.className = 'text-center p-4 rounded-lg mb-4 bg-red-100';
    }
    
    // 重置游戏状态
    setTimeout(() => {
        resetGame();
    }, 3000);
});

// 更新UI根据角色
function updateUIForRole(role) {
    if (role === 'painter') {
        toolbarEl.classList.remove('hidden');
        submitDrawingBtn.classList.remove('hidden');
        guessSectionEl.classList.add('hidden');
        receivedImageContainerEl.classList.add('hidden');
        wordInputSectionEl.classList.remove('hidden');
        canvas.style.display = 'block';
    } else {
        toolbarEl.classList.add('hidden');
        canvas.style.display = 'none';
        guessSectionEl.classList.add('hidden');
        receivedImageContainerEl.classList.add('hidden');
        wordInputSectionEl.classList.add('hidden');
    }
}

// 更新状态
function updateStatus(message) {
    statusEl.innerHTML = `<span class="text-blue-800 font-semibold">${message}</span>`;
}

// 重置游戏
function resetGame() {
    gameResultEl.classList.add('hidden');
    receivedImageContainerEl.classList.add('hidden');
    guessSectionEl.classList.add('hidden');
    guessInputEl.value = '';
    guessInputEl.disabled = false;
    submitGuessBtn.disabled = false;
    submitDrawingBtn.disabled = false;
    
    // 清除画布
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (currentRole === 'painter') {
        updateStatus('你是绘画者，开始新的绘画吧！');
    } else {
        updateStatus('你是猜测者，等待新的绘画...');
    }
}

// 初始化工具按钮样式
brushToolBtn.classList.add('bg-blue-700');
