# Tauri + Solid + Typescript

This template should help get you started developing with Tauri, Solid and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 提交到 GitHub

1. **在 GitHub 上新建仓库**  
   打开 [GitHub New Repository](https://github.com/new)，填写仓库名（如 `Reader`），选择 Public/Private，**不要**勾选 “Add a README”等初始化选项（本地已有项目）。

2. **本地初始化并关联远程**（若尚未初始化 Git）：
   ```bash
   cd /d/Projects/Rust/Reader
   git init
   git add .
   git commit -m "Initial commit: Reader (Tauri + Solid)"
   git branch -M main
   git remote add origin https://github.com/你的用户名/Reader.git
   git push -u origin main
   ```

3. **若项目已是 Git 仓库**，只需添加远程并推送：
   ```bash
   git remote add origin https://github.com/你的用户名/Reader.git
   git branch -M main   # 若当前分支不是 main 可先改名为 main
   git push -u origin main
   ```

4. **使用 SSH 推送**（若已配置 SSH key）：
   ```bash
   git remote add origin git@github.com:你的用户名/Reader.git
   git push -u origin main
   ```

将上述 `你的用户名/Reader` 替换为你的 GitHub 用户名和仓库名。
