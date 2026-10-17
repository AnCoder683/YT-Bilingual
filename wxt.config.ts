import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'YT Bilingual',
    description: 'Phụ đề song ngữ YouTube, dịch theo câu và có ngữ cảnh',
    permissions: ['storage'],
    host_permissions: ['https://www.youtube.com/*', 'https://api.anthropic.com/*'],
  },
  // Load unpacked thủ công vào Brave (giữ profile đã đăng nhập YouTube).
  webExt: { disabled: true },
});
