// Alike Studio — safe bridge between the editor page and the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alikeNative', {
  isDesktop: true,
  save: (suggestedName, data, path, filters) => ipcRenderer.invoke('alike:save', { suggestedName, data, path, filters }),
  open: (filters) => ipcRenderer.invoke('alike:open', { filters }),
  read: (path) => ipcRenderer.invoke('alike:read', path),
  readBytes: (path) => ipcRenderer.invoke('alike:readBytes', path),
  pendingOpen: () => ipcRenderer.invoke('alike:pendingOpen'),
  version: () => ipcRenderer.invoke('alike:version'),
  openResource: (name) => ipcRenderer.invoke('alike:openResource', name),
  setTitle: (t) => ipcRenderer.send('alike:title', t),
  onOpenFile: (fn) => ipcRenderer.on('alike:openFile', (_e, p) => fn(p)),
  pickFolder: (title) => ipcRenderer.invoke('alike:pickFolder', title),
  readImages: (folder) => ipcRenderer.invoke('alike:readImages', folder),
  watchImages: (folder) => ipcRenderer.invoke('alike:watchImages', folder),
  onImagesChanged: (fn) => ipcRenderer.on('alike:imagesChanged', (_e, list) => fn(list)),
});
