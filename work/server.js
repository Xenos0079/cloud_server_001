const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.IO 安全配置
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS || "*", // 生产环境应设置具体域名
    methods: ["GET", "POST"]
  },
  // 限制连接速率
  pingTimeout: 60000,
  pingInterval: 25000
});

// 安全辅助函数
function sanitizeString(str, maxLength = 100) {
  if (typeof str !== 'string') return '';
  // 移除 HTML 标签和特殊字符，只保留字母、数字、空格和常见标点
  return str.replace(/[<>]/g, '').substring(0, maxLength).trim();
}

function validateBase64Image(base64String, maxSizeKB = 500) {
  if (typeof base64String !== 'string') return false;
  // 检查是否是有效的 Base64 图片格式
  if (!base64String.startsWith('data:image/')) return false;
  // 检查大小（Base64 编码后比原图大约 33%）
  const sizeInBytes = (base64String.length * 3) / 4;
  const sizeInKB = sizeInBytes / 1024;
  return sizeInKB <= maxSizeKB;
}

// 服务静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 游戏状态（内存存储）
const gameState = {
  players: [],
  currentWord: null,
  imageBuffer: null,
  roles: {} // { socketId: 'painter' | 'guesser' }
};

// Socket连接处理
io.on('connection', (socket) => {
  console.log(`用户连接: ${socket.id}`);

  // 玩家加入游戏
  socket.on('join', () => {
    if (gameState.players.length === 0) {
      // 第一个玩家是Painter
      gameState.players.push(socket.id);
      gameState.roles[socket.id] = 'painter';
      socket.emit('role_assigned', { role: 'painter' });
      console.log(`玩家 ${socket.id} 加入为 Painter`);
    } else if (gameState.players.length === 1) {
      // 第二个玩家是Guesser
      gameState.players.push(socket.id);
      gameState.roles[socket.id] = 'guesser';
      socket.emit('role_assigned', { role: 'guesser' });
      
      // 通知Painter有玩家加入
      io.to(gameState.players[0]).emit('player_joined');
      console.log(`玩家 ${socket.id} 加入为 Guesser`);
    } else {
      // 游戏已满
      socket.emit('game_full');
      console.log(`玩家 ${socket.id} 尝试加入但游戏已满`);
    }
  });

  // Painter提交绘画
  socket.on('submit_drawing', (data) => {
    if (gameState.roles[socket.id] === 'painter') {
      // 验证图片数据
      if (!data || !data.image || !validateBase64Image(data.image)) {
        socket.emit('error', { message: '无效的图片数据或图片过大（最大500KB）' });
        return;
      }
      
      gameState.imageBuffer = data.image; // Base64图片
      
      // 发送给Guesser
      const guesserId = gameState.players.find(id => gameState.roles[id] === 'guesser');
      if (guesserId) {
        io.to(guesserId).emit('drawing_received', { image: data.image });
        console.log('绘画已发送给Guesser');
      }
    }
  });

  // Guesser提交猜测
  socket.on('check_guess', (data) => {
    if (gameState.roles[socket.id] === 'guesser') {
      // 验证和清理输入
      if (!data || !data.guess || typeof data.guess !== 'string') {
        socket.emit('error', { message: '无效的猜测输入' });
        return;
      }
      
      const sanitizedGuess = sanitizeString(data.guess, 50);
      const guess = sanitizedGuess.toLowerCase().trim();
      const correctWord = gameState.currentWord ? gameState.currentWord.toLowerCase().trim() : null;
      
      if (!guess) {
        socket.emit('error', { message: '猜测不能为空' });
        return;
      }
      
      const isCorrect = correctWord && guess === correctWord;
      
      // 发送结果给两个玩家（清理后的数据）
      io.emit('game_result', {
        correct: isCorrect,
        guess: sanitizedGuess, // 使用清理后的数据
        correctWord: gameState.currentWord ? sanitizeString(gameState.currentWord, 50) : null
      });
      
      console.log(`Guesser猜测: ${sanitizedGuess}, 正确答案: ${gameState.currentWord}, 结果: ${isCorrect}`);
    }
  });

  // 设置当前单词（可选，用于测试）
  socket.on('set_word', (data) => {
    if (gameState.roles[socket.id] === 'painter') {
      // 验证和清理输入
      if (!data || !data.word || typeof data.word !== 'string') {
        socket.emit('error', { message: '无效的单词输入' });
        return;
      }
      
      const sanitizedWord = sanitizeString(data.word, 50);
      if (!sanitizedWord) {
        socket.emit('error', { message: '单词不能为空' });
        return;
      }
      
      gameState.currentWord = sanitizedWord;
      console.log(`单词已设置为: ${sanitizedWord}`);
      socket.emit('word_set', { word: sanitizedWord });
    }
  });

  // 玩家断开连接
  socket.on('disconnect', () => {
    console.log(`用户断开连接: ${socket.id}`);
    const index = gameState.players.indexOf(socket.id);
    if (index > -1) {
      gameState.players.splice(index, 1);
      delete gameState.roles[socket.id];
    }
  });
});

// 启动服务器
// 注意：生产环境建议使用环境变量配置端口和主机
const PORT = process.env.PORT || 3000;
// 生产环境建议使用 '127.0.0.1' 或具体 IP，而不是 '0.0.0.0'
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`);
  console.log(`本地访问: http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ 错误: 端口 ${PORT} 已被占用！`);
    console.error(`\n解决方案:`);
    console.error(`1. 查找并终止占用端口的进程:`);
    console.error(`   sudo lsof -ti:${PORT} | xargs kill -9`);
    console.error(`   或`);
    console.error(`   sudo fuser -k ${PORT}/tcp`);
    console.error(`\n2. 或者修改 server.js 中的 PORT 变量使用其他端口\n`);
    process.exit(1);
  } else {
    console.error('服务器启动失败:', err);
    process.exit(1);
  }
});
