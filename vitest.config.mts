// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { include: ['tests/**/*.test.{ts,tsx}'] }
})
