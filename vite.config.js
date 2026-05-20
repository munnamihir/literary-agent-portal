import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Change 'literary-agent-portal' to your actual GitHub repo name
  base: '/literary-agent-portal/',
})
