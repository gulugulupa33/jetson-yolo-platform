#!/bin/bash
# =============================================================================
# Jetson YOLO Platform - 一键部署脚本
# 适用于 Jetson Nano / Orin / DGX Spark
# =============================================================================
set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Jetson YOLO Platform 一键部署${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ---- 检查系统 ----
echo -e "${YELLOW}[1/5] 检查系统环境...${NC}"

ARCH=$(uname -m)
echo "  架构: $ARCH"

if [[ "$ARCH" != "aarch64" ]]; then
    echo -e "${YELLOW}  警告: 非 ARM64 架构，TensorRT 编译可能不可用${NC}"
fi

# 检查 Docker
if ! command -v docker &>/dev/null; then
    echo -e "${RED}  ✗ Docker 未安装${NC}"
    echo "  安装命令: curl -fsSL https://get.docker.com | sh"
    exit 1
fi
echo -e "${GREEN}  ✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"

# 检查 docker 权限
DOCKER_CMD="docker"
if ! docker ps &>/dev/null; then
    if sudo docker ps &>/dev/null; then
        echo -e "${YELLOW}  ⚠ 使用 sudo 运行 Docker${NC}"
        DOCKER_CMD="sudo docker"
        DOCKER_COMPOSE_CMD="sudo docker compose"
    else
        echo -e "${YELLOW}  ⚠ 尝试添加到 docker 组...${NC}"
        sudo usermod -aG docker "$USER" 2>/dev/null && \
            echo -e "${GREEN}  ✓ 已添加到 docker 组，请退出重新登录${NC}" || \
            echo -e "${YELLOW}  ⚠ 无法自动添加，请手动: sudo usermod -aG docker $USER${NC}"
        DOCKER_CMD="sg docker -c docker"
        DOCKER_COMPOSE_CMD="sg docker -c \"docker compose\""
    fi
fi

# 检查 NVIDIA Container Toolkit
if docker info 2>/dev/null | grep -q "nvidia"; then
    echo -e "${GREEN}  ✓ NVIDIA Container Toolkit 已安装${NC}"
    HAS_NVIDIA=true
else
    echo -e "${YELLOW}  ⚠ NVIDIA Container Toolkit 未安装${NC}"
    echo "    推理仍可使用 CPU 模式运行（性能下降）"
    echo "    安装: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
    HAS_NVIDIA=false
fi

# 检查 nvidia-smi（可选）
if command -v nvidia-smi &>/dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -1)
    echo -e "${GREEN}  ✓ GPU: $GPU_INFO${NC}"
else
    echo -e "${YELLOW}  ⚠ nvidia-smi 不可用（容器外无 GPU 驱动）${NC}"
fi
echo ""

# ---- 准备模型目录 ----
echo -e "${YELLOW}[2/5] 创建数据目录...${NC}"
mkdir -p backend/models backend/engines backend/config backend/data
echo -e "${GREEN}  ✓ 目录已创建${NC}"
echo ""

# ---- 构建 Docker 镜像 ----
echo -e "${YELLOW}[3/5] 构建 Docker 镜像（可能需要 5-15 分钟）...${NC}"
echo "  镜像名: jetson-yolo-platform:latest"
echo ""

# 根据 GPU 可用性决定 build arg
BUILD_ARGS=""
if [[ "$HAS_NVIDIA" == true ]]; then
    # 检测 TensorRT
    if dpkg -l | grep -q tensorrt; then
        echo -e "${GREEN}  ✓ 检测到 TensorRT，启用 GPU 优化${NC}"
        BUILD_ARGS="--build-arg USE_TENSORRT=true"
    fi
fi

docker build $BUILD_ARGS -t jetson-yolo-platform:latest . 2>&1 | while IFS= read -r line; do
    # 显示进度行，过滤掉常规构建输出只显示关键步骤
    if echo "$line" | grep -qE "(Step |Successfully|exporting|sending)"; then
        echo "  $line"
    fi
done

if [ $? -ne 0 ]; then
    echo -e "${RED}  ✗ 构建失败，请检查上方错误信息${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ 镜像构建成功${NC}"
echo ""

# ---- 配置 ----
echo -e "${YELLOW}[4/5] 配置...${NC}"

# 提示创建默认配置文件
if [ ! -f backend/config/config.yaml ]; then
    cat > backend/config/config.yaml << 'YAMLEOF'
# Jetson YOLO Platform 配置
server:
  host: "0.0.0.0"
  port: 8000

storage:
  models_dir: "backend/models"
  engines_dir: "backend/engines"
  config_dir: "backend/config"
  data_dir: "backend/data"

deploy:
  default_mode: "hybrid"
  max_streams: 5

monitoring:
  stats_interval: 2
YAMLEOF
    echo -e "${GREEN}  ✓ 默认配置文件已创建${NC}"
fi

# 创建 .env（WebSocket URL）
cat > .env << 'ENVEOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
ENVEOF
echo -e "${GREEN}  ✓ 环境变量文件已创建${NC}"
echo ""

# ---- 启动服务 ----
echo -e "${YELLOW}[5/5] 启动服务...${NC}"

# 检查是否有其他容器占用端口
for port in 80 8000; do
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "jetson-yolo"; then
        echo -e "${YELLOW}  ⚠ 检测到已有的 jetson-yolo 容器，停止并删除...${NC}"
        docker stop jetson-yolo 2>/dev/null || true
        docker rm jetson-yolo 2>/dev/null || true
    fi
done

# 启动
docker compose up -d

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  访问地址:  ${BLUE}http://localhost${NC}"
echo -e "  API 地址:  ${BLUE}http://localhost:8000${NC}"
echo -e "  API 文档:  ${BLUE}http://localhost:8000/docs${NC}"
echo ""
echo -e "  上传 .pt 模型到:  ${BLUE}http://localhost/models${NC}"
echo -e "  查看实时监控:     ${BLUE}http://localhost/monitor${NC}"
echo ""

# 实时日志
echo -e "${YELLOW}查看实时日志: docker compose logs -f${NC}"
echo -e "${YELLOW}停止服务:     docker compose down${NC}"
echo -e "${YELLOW}重启服务:     docker compose restart${NC}"
echo ""
