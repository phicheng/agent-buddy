# Agent Buddy

讓你的 Claude Code 變成浮在桌面上的 3D 小夥伴。
你叫 Claude 做事時，牠會即時跟著動：思考、找資料、寫東西、用工具、卡住、完成。

每個專案資料夾都是一隻小夥伴，可以幫牠取名字、換角色、換裝，還能讓牠住進共享辦公室、客廳、書房或戶外咖啡廳。

牠只是配角：顏色低調，會跟著系統的深淺色切換，滑鼠也可以直接穿過牠，點到後面的東西。

---

## 安裝（3 步）

1. **下載**：到 [Releases](../../releases/latest) 下載你的版本
   - Mac：`AgentBuddy-…-mac-universal.dmg`
   - Windows：`AgentBuddy-…-win-x64.exe`（新的 ARM 筆電選 `arm64`）
2. **打開**
   - Mac：把 Agent Buddy 拖進「應用程式」，然後打開它。
   - Windows：直接執行安裝檔，裝好會自動打開。
3. **按「連接 Claude Code」**：第一次打開會出現設定視窗，按一下就完成。之後新開的 Claude Code 對話，小夥伴就會開始動。

> 想再打開設定：Mac 點上方選單列的小機器人圖示；Windows 點右下角工作列的小圖示。也可以在小夥伴身上連點兩下。

### 第一次打開時被系統擋下來？

目前版本還沒有做 Apple／Microsoft 簽章，所以第一次會跳警告，這是正常的：

- **Mac**：出現「無法打開」時，到「系統設定 → 隱私權與安全性」，往下找到 Agent Buddy，按「強制打開」。
- **Windows**：出現藍色的「Windows 已保護您的電腦」時，按「其他資訊」→「仍要執行」。

---

## 支援哪些 Claude

| 支援 | 不支援 |
|---|---|
| 終端機裡的 Claude Code | claude.ai 網頁上的一般聊天 |
| Claude 桌面 App 的 Code 分頁 | Claude 手機 App |
| VS Code、JetBrains 的 Claude Code 外掛 | |

## 隱私

- 「連接 Claude Code」只會在 `~/.claude/settings.json` 加上幾行通知設定，原本的設定都不會動，修改前也會自動備份。
- 小夥伴只會收到「狀態＋一小段標籤」，例如「讀 README.md」「跑測試」。檔案內容和指令結果都不會傳過來。
- 所有資料只在你的電腦裡傳（`127.0.0.1`），不會上網。
- 按「解除連接」就會把那幾行移除，乾乾淨淨。

---

## 給開發者

```bash
npm install
npm start        # 開發模式
npm test         # 測試事件對應和設定檔安裝
npm run dist     # 打包成安裝檔（輸出到 dist/）
```

推一個版本標籤（例如 `v0.1.0`）到 GitHub，GitHub Actions 會自動做出 Mac 和 Windows 安裝檔，放到 Releases。

**簽章（選用）**：在 repo 的 Settings → Secrets 加上下面這些，Mac 版就會簽章並通過 Apple 驗證，使用者打開時就不會被擋：
`MAC_CERT_P12_BASE64`、`MAC_CERT_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`（需要 Apple Developer Program，一年 99 美元）。

### 運作方式

```
Claude Code ──(hooks，每一步)──▶ 127.0.0.1:47321/event ──▶ Agent Buddy
                                                          ├─ 透明懸浮視窗（3D 小夥伴）
                                                          └─ 設定視窗（打扮、住哪裡、連接）
```

- `app/main/claude-hooks.js`：安全地加入或移除 Claude Code hooks
- `app/main/map.js`：把 Claude 的事件轉成小夥伴的狀態
- `app/renderer/buddy.html`：3D 小夥伴（懸浮視窗和設定視窗共用）

授權：MIT。3D 引擎使用 [three.js](https://threejs.org)（MIT）。
