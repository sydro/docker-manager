import Clutter from 'gi://Clutter'
import St from 'gi://St'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import { listContainers, listRunningContainers } from './functions/docker.js'

const DockerIndicator = GObject.registerClass(
  class DockerIndicator extends PanelMenu.Button {
    _init(extensionPath) {
      super._init(0.0, 'Docker Manager')

      this._dotIcon = Gio.icon_new_for_string(`${extensionPath}/icons/status-dot-symbolic.svg`)

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
      const stoppedLabel = (this._stoppedLabel = new St.Label({
        text: '0',
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'docker-manager-stopped',
        visible: false,
      }))

      const box = new St.BoxLayout({
        style_class: 'docker-manager-box',
      })

      box.add_child(icon)
      box.add_child(label)
      box.add_child(stoppedLabel)
      this.add_child(box)

      this._showAll = false
      this._toggle = new PopupMenu.PopupSwitchMenuItem('Show all', this._showAll)
      this._toggle.closeOnActivate = false
      this._toggle.connect('toggled', (_item, value) => {
        this._showAll = value
        this.refresh()
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
          this.menu.open()
          return GLib.SOURCE_REMOVE
        })
      })
      this.menu.addMenuItem(this._toggle)
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      this._listBox = new St.BoxLayout({
        vertical: true,
        style_class: 'docker-manager-list',
      })
      this._scrollView = new St.ScrollView({
        style_class: 'docker-manager-scroll',
        overlay_scrollbars: false,
      })
      this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC)
      this._scrollView.set_child(this._listBox)
      this._listItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false })
      this._listItem.add_child(this._scrollView)
      this.menu.addMenuItem(this._listItem)
    }

    async refresh() {
      try {
        if (this._showAll) {
          const containers = await listContainers()
          const running = containers.filter(c => c.state === 'running')
          const stopped = containers.filter(c => c.state !== 'running')
          this._label.text = String(running.length)
          this._stoppedLabel.text = String(stopped.length)
          this._stoppedLabel.visible = true
          this._refreshMenu(containers)
          return
        }

        const containers = await listRunningContainers()
        this._label.text = String(containers.length)
        this._stoppedLabel.visible = false
        this._refreshMenu(containers)
      } catch (_error) {
        this._label.text = '0'
        this._stoppedLabel.visible = false
      }
    }

    _refreshMenu(containers) {
      this._listBox.remove_all_children()

      const running = containers.filter(c => c.state === 'running')
      const stopped = containers.filter(c => c.state !== 'running')

      if (this._showAll) {
        this._addSection(`Running (${running.length})`, running, 'docker-section-running')
        this._addSection(`Stopped (${stopped.length})`, stopped, 'docker-section-stopped')
        if (running.length === 0 && stopped.length === 0) {
          this._listBox.add_child(
            new St.Label({ text: 'Nessun container', style_class: 'docker-manager-empty' })
          )
        }
      } else {
        this._addSection(`Running (${running.length})`, running, 'docker-section-running')
        if (running.length === 0) {
          this._listBox.add_child(
            new St.Label({ text: 'Nessun container attivo', style_class: 'docker-manager-empty' })
          )
        }
      }
    }

    _addSection(title, items, sectionClass) {
      const section = new St.BoxLayout({
        vertical: true,
        style_class: `docker-section ${sectionClass}`,
      })
      const header = new St.Label({
        text: title,
        style_class: 'docker-section-title',
      })
      section.add_child(header)

      for (const c of items) {
        const row = new St.BoxLayout({ style_class: 'docker-row' })
        const dot = new St.Icon({
          gicon: this._dotIcon,
          icon_size: 12,
          style_class:
            c.state === 'running'
              ? 'docker-dot-icon docker-dot-running'
              : 'docker-dot-icon docker-dot-stopped',
        })
        const label = new St.Label({
          text: `${c.name} (${c.image})`,
          style_class: 'docker-manager-item',
        })
        row.add_child(dot)
        row.add_child(label)
        section.add_child(row)
      }

      this._listBox.add_child(section)
    }

    async _getContainers() {
      if (this._showAll) {
        return await listContainers()
      }
      return await listRunningContainers()
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
