#!/bin/bash
# 终止占用指定端口的进程

PORT=${1:-3000}

echo "正在查找占用端口 $PORT 的进程..."

# 尝试使用 lsof
PID=$(lsof -ti:$PORT 2>/dev/null)

if [ -z "$PID" ]; then
    # 尝试使用 fuser
    PID=$(fuser $PORT/tcp 2>/dev/null | awk '{print $1}')
fi

if [ -z "$PID" ]; then
    echo "未找到占用端口 $PORT 的进程"
    exit 0
fi

echo "找到进程 PID: $PID"
echo "正在终止进程..."

# 尝试普通终止
kill $PID 2>/dev/null

# 等待一下
sleep 1

# 检查是否还在运行
if kill -0 $PID 2>/dev/null; then
    echo "进程仍在运行，使用强制终止..."
    kill -9 $PID 2>/dev/null
    sleep 1
fi

# 再次检查
if kill -0 $PID 2>/dev/null; then
    echo "⚠️  无法终止进程，可能需要 root 权限"
    echo "请尝试运行: sudo kill -9 $PID"
    exit 1
else
    echo "✅ 进程已成功终止"
    exit 0
fi
