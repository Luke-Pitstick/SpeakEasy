// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

// GitHub Pages serves the site at https://luke-pitstick.github.io/SpeakEasy/, so the deploy
// workflow sets SITE_BASE=/SpeakEasy. Locally the site is served from the root, so
// http://localhost:4321/ is the home page. If a custom domain is added, drop SITE_BASE.
const base = process.env.SITE_BASE || '/'

export default defineConfig({
	site: process.env.SITE_URL || 'https://luke-pitstick.github.io',
	base,
	integrations: [
		starlight({
			title: 'SpeakEasy',
			description:
				'An open source desktop app for writing and speaking with your eyes. Enter initials, review a suggested phrase, and choose when to say it out loud.',
			favicon: '/favicon.svg',
			customCss: ['./src/styles/theme.css'],
			components: {
				SocialIcons: './src/components/GitHubLink.astro',
				ThemeProvider: './src/components/ThemeProvider.astro',
				ThemeSelect: './src/components/ThemeSelect.astro'
			},
			expressiveCode: {
				// Plain code blocks: no editor tabs or terminal title bar. A block with a title still
				// gets its own frame.
				defaultProps: { frame: 'none' },
				styleOverrides: {
					borderRadius: '0.25rem',
					borderColor: 'var(--se-border)',
					frames: {
						frameBoxShadowCssValue: 'none'
					}
				}
			},
			editLink: {
				baseUrl: 'https://github.com/Luke-Pitstick/SpeakEasy/edit/main/website/'
			},
			lastUpdated: true,
			sidebar: [
				{ label: 'Introduction', slug: 'index' },
				{ label: 'Getting started', items: [{ autogenerate: { directory: 'getting-started' } }] },
				{ label: 'Settings', items: [{ autogenerate: { directory: 'settings' } }] },
				{ label: 'Privacy and data', items: [{ autogenerate: { directory: 'privacy' } }] },
				{ label: 'Development', items: [{ autogenerate: { directory: 'development' } }] },
				{ label: 'Help', items: [{ autogenerate: { directory: 'help' } }] }
			]
		})
	]
})
