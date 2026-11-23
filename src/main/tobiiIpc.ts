// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

import { createSocket, type Socket } from 'node:dgram'
import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { TOBII_PORT, parseTobiiPacket, type TobiiStatus } from '../shared/tobii'

/**
 * Receives Tobii gaze from the Talon bridge script on a loopback-only UDP port and forwards
 * validated samples to the window. The port is open only while the renderer has the Tobii input
 * selected.
 */
export function installTobiiIpc(window: BrowserWindow): void {
  let socket: Socket | null = null
  const own = (event: IpcMainInvokeEvent | IpcMainEvent): boolean =>
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === window.webContents.getURL()
  const close = (): void => {
    socket?.close()
    socket = null
  }

  ipcMain.handle('tobii:start', (event): Promise<TobiiStatus> => {
    if (!own(event)) throw Error('Could not start Tobii input')
    if (socket) return Promise.resolve({ error: null })
    return new Promise((resolve) => {
      const udp = createSocket('udp4')
      udp.once('error', (err: NodeJS.ErrnoException) => {
        udp.close()
        resolve({
          error:
            err.code === 'EADDRINUSE'
              ? `Port ${TOBII_PORT} is already in use. Quit the other app using it.`
              : `Could not listen for gaze (${err.message}).`
        })
      })
      udp.on('message', (data, remote) => {
        if (remote.address !== '127.0.0.1' || window.isDestroyed()) return
        const sample = parseTobiiPacket(data.toString('utf8'))
        if (sample) window.webContents.send('tobii:sample', sample)
      })
      udp.bind(TOBII_PORT, '127.0.0.1', () => {
        udp.removeAllListeners('error')
        udp.on('error', () => {
          if (socket === udp) close()
        })
        socket = udp
        resolve({ error: null })
      })
    })
  })
  ipcMain.on('tobii:stop', (event) => {
    if (own(event)) close()
  })
  window.on('closed', () => {
    close()
    ipcMain.removeHandler('tobii:start')
    ipcMain.removeAllListeners('tobii:stop')
  })
}
