# image2-api

可切换供应商的通用 Image2 生图 Skill。兼容 OpenAI Images API 的文生图、图生图和蒙版编辑接口，无第三方 Python 依赖。

## 安装

```bash
git clone https://github.com/vshen009/vstack.git
cd vstack && ./install.sh
```

安装脚本会将本技能软链到 Codex 和 Claude Code 的技能目录。也可以单独复制本目录到任意兼容工具的 skills 目录。

## 配置

复制 `.env.example` 为 `.env`，通常只需修改两项：

```env
IMAGE2_BASE_URL=https://provider.example.com/
IMAGE2_API_KEY=你的本地密钥
```

接口会自动拼接为：

- `https://provider.example.com/v1/images/generations`
- `https://provider.example.com/v1/images/edits`

如果供应商使用 `x-api-key`：

```env
IMAGE2_AUTH_HEADER=x-api-key
IMAGE2_AUTH_SCHEME=
```

`.env` 已被忽略，不要把真实密钥提交到 Git。

## 使用

```powershell
# 检查配置，不发请求
py scripts/image2_api.py --prompt "test" --dry-run

# 文生图
py scripts/image2_api.py --prompt "一只在竹林里喝茶的橘猫" --preset square

# 图生图
py scripts/image2_api.py --image source.png --input-fidelity high --prompt "改成水彩风格"
```

Linux 和 macOS 将 `py` 换成 `python3`。
