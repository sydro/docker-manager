import Clutter from 'gi://Clutter'
import St from 'gi://St'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import { countRunningContainers } from './functions/docker.js'

const DockerIndicator = GObject.registerClass(
  class DockerIndicator extends PanelMenu.Button {
    _init(extensionPath) {
      super._init(0.0, 'Docker Manager')

      const iconPath = `${extensionPath}/icons/docker-symbolic.svg`
      const gicon = Gio.icon_new_for_string(iconPath)
      const icon = (this._icon = new St.Icon({
        gicon,
        icon_size: 20,
        style_class: 'docker-manager-icon',
      }))

      const label = (this._label = new St.Label({
        text: '0',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'docker-manager-count',
      }))

      const box = new St.BoxLayout({
        style_class: 'docker-manager-box',
      })

      box.add_child(icon)
      box.add_child(label)
      this.add_child(box)
    }

    async refresh() {
      try {
        const count = await countRunningContainers()
        this._label.text = String(count)
      } catch (_error) {
        this._label.text = '0'
      }
    }
  }
)

export default class DockerManagerExtension extends Extension {
  enable() {
    this._indicator = new DockerIndicator(this.path)
    Main.panel.addToStatusArea('docker-manager', this._indicator)
    this._indicator.refresh()
    this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
      this._indicator.refresh()
      return GLib.SOURCE_CONTINUE
    })
  }

  disable() {
    if (this._timeoutId) {
      GLib.source_remove(this._timeoutId)
      this._timeoutId = null
    }
    if (this._indicator) {
      this._indicator.destroy()
      this._indicator = null
    }
  }
}
