const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

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
      const guess = data.guess.toLowerCase().trim();
      const correctWord = gameState.currentWord ? gameState.currentWord.toLowerCase().trim() : null;
      
      const isCorrect = correctWord && guess === correctWord;
      
      // 发送结果给两个玩家
      io.emit('game_result', {
        correct: isCorrect,
        guess: data.guess,
        correctWord: gameState.currentWord
      });
      
      console.log(`Guesser猜测: ${data.guess}, 正确答案: ${gameState.currentWord}, 结果: ${isCorrect}`);
    }
  });

  // 设置当前单词（可选，用于测试）
  socket.on('set_word', (data) => {
    if (gameState.roles[socket.id] === 'painter') {
      gameState.currentWord = data.word;
      console.log(`单词已设置为: ${data.word}`);
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
const PORT = 3000;
const HOST = '0.0.0.0';

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
