import Clutter from 'gi://Clutter'
import St from 'gi://St'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js'
import {
  deleteContainer,
  listContainers,
  listRunningContainers,
  startContainer,
  stopContainer,
} from './functions/docker.js'

const DockerIndicator = GObject.registerClass(
  class DockerIndicator extends PanelMenu.Button {
    _init(extension) {
      super._init(0.0, 'Docker Manager')
      this._extension = extension
      const extensionPath = extension.path

      this._dotIcon = Gio.icon_new_for_string(`${extensionPath}/icons/status-dot-symbolic.svg`)
      this._icons = {
        stop: Gio.icon_new_for_string(`${extensionPath}/icons/stop-symbolic.svg`),
        play: Gio.icon_new_for_string(`${extensionPath}/icons/play-symbolic.svg`),
        ban: Gio.icon_new_for_string(`${extensionPath}/icons/ban-symbolic.svg`),
      }

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
      this._listSection = new PopupMenu.PopupMenuSection()
      this._scrollView = new St.ScrollView({
        style_class: 'docker-manager-scroll',
        overlay_scrollbars: false,
      })
      this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.NEVER)
      this._scrollView.set_child(this._listSection.actor)
      this._listItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false })
      this._listItem.add_child(this._scrollView)
      this.menu.addMenuItem(this._listItem)
      this._openSubmenu = null
      this._confirmDialog = null
      this.menu.connect('open-state-changed', (_menu, isOpen) => {
        if (!isOpen) return
        this._updateScrollPolicy()
      })
      this.menu.connect('open-state-changed', (_menu, isOpen) => {
        if (!isOpen) {
          this.refresh()
        }
      })

      this.connect('button-press-event', (_actor, event) => {
        if (event.get_button() === 3) {
          this.menu.close()
          this._extension.openPreferences()
          return Clutter.EVENT_STOP
        }
        return Clutter.EVENT_PROPAGATE
      })
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
          this._updateScrollPolicy()
          return
        }

        const containers = await listRunningContainers()
        this._label.text = String(containers.length)
        this._stoppedLabel.visible = false
        this._refreshMenu(containers)
        this._updateScrollPolicy()
      } catch (_error) {
        this._label.text = '0'
        this._stoppedLabel.visible = false
      }
    }

    _updateScrollPolicy() {
      if (!this.menu.isOpen) return
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        const monitor = Main.layoutManager.primaryMonitor
        const maxHeight = Math.round(monitor.height * 0.7)
        const [, naturalHeight] = this._listSection.actor.get_preferred_height(-1)
        if (naturalHeight > maxHeight) {
          this._scrollView.style = `max-height: ${maxHeight}px;`
          this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC)
        } else {
          this._scrollView.style = 'max-height: none;'
          this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.NEVER)
        }
        return GLib.SOURCE_REMOVE
      })
    }

    _refreshMenu(containers) {
      if (this._listSection.removeAll) {
        this._listSection.removeAll()
      } else {
        this._listSection.actor.remove_all_children()
      }

      const running = containers.filter(c => c.state === 'running')
      const stopped = containers.filter(c => c.state !== 'running')

      if (this._showAll) {
        this._addSection(`Running (${running.length})`, running, 'docker-section-running')
        this._addSection(`Stopped (${stopped.length})`, stopped, 'docker-section-stopped')
        if (running.length === 0 && stopped.length === 0) {
          const emptyItem = new PopupMenu.PopupMenuItem('Nessun container', {
            reactive: false,
            can_focus: false,
          })
          emptyItem.add_style_class_name('docker-manager-empty')
          this._listSection.addMenuItem(emptyItem)
        }
      } else {
        this._addSection(`Running (${running.length})`, running, 'docker-section-running')
        if (running.length === 0) {
          const emptyItem = new PopupMenu.PopupMenuItem('Nessun container attivo', {
            reactive: false,
            can_focus: false,
          })
          emptyItem.add_style_class_name('docker-manager-empty')
          this._listSection.addMenuItem(emptyItem)
        }
      }
    }

    _addSection(title, items, sectionClass) {
      const section = new PopupMenu.PopupMenuSection()
      section.actor.add_style_class_name(`docker-section ${sectionClass}`)

      const headerItem = new PopupMenu.PopupMenuItem(title, { reactive: false, can_focus: false })
      headerItem.add_style_class_name('docker-section-title')
      section.addMenuItem(headerItem)

      for (const c of items) {
        const dot = new St.Icon({
          gicon: this._dotIcon,
          icon_size: 12,
          style_class:
            c.state === 'running' ? 'docker-dot-icon docker-dot-running' : 'docker-dot-icon docker-dot-stopped',
        })
        const label = new St.Label({
          text: `${c.name} (${c.image})`,
          style_class: 'docker-manager-item',
        })
        const item = new PopupMenu.PopupSubMenuMenuItem('', false)
        item.label.text = ''
        item.label.hide()
        item.insert_child_at_index(dot, 0)
        item.insert_child_at_index(label, 1)

        const actionsItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false })
        const actionsBox = new St.BoxLayout({ style_class: 'docker-actions' })
        if (c.state === 'running') {
          const stopBox = new St.BoxLayout({ style_class: 'docker-action-content' })
          stopBox.add_child(new St.Icon({ gicon: this._icons.stop, icon_size: 16 }))
          stopBox.add_child(new St.Label({ text: 'Stop', style_class: 'docker-action-label' }))
          const stopButton = new St.Button({
            style_class: 'docker-action-button docker-action-stop',
            child: stopBox,
          })
          stopButton.connect('clicked', async () => {
            await stopContainer(c.id)
            this.refresh()
          })
          actionsBox.add_child(stopButton)
        } else {
          const startBox = new St.BoxLayout({ style_class: 'docker-action-content' })
          startBox.add_child(new St.Icon({ gicon: this._icons.play, icon_size: 16 }))
          startBox.add_child(new St.Label({ text: 'Start', style_class: 'docker-action-label' }))
          const startButton = new St.Button({
            style_class: 'docker-action-button docker-action-play',
            child: startBox,
          })
          startButton.connect('clicked', async () => {
            await startContainer(c.id)
            this.refresh()
          })
          actionsBox.add_child(startButton)
          const deleteBox = new St.BoxLayout({ style_class: 'docker-action-content' })
          deleteBox.add_child(new St.Icon({ gicon: this._icons.ban, icon_size: 16 }))
          deleteBox.add_child(new St.Label({ text: 'Delete', style_class: 'docker-action-label' }))
          const deleteButton = new St.Button({
            style_class: 'docker-action-button docker-action-trash',
            child: deleteBox,
          })
          deleteButton.connect('clicked', async () => {
            this._confirmDelete(c)
          })
          actionsBox.add_child(deleteButton)
        }
        actionsItem.add_child(actionsBox)
        item.menu.addMenuItem(actionsItem)

        item.menu.connect('open-state-changed', (_menu, isOpen) => {
          if (isOpen) {
            if (this._openSubmenu && this._openSubmenu !== item.menu) {
              this._openSubmenu.close()
            }
            this._openSubmenu = item.menu
          } else if (this._openSubmenu === item.menu) {
            this._openSubmenu = null
          }
        })

        section.addMenuItem(item)
      }
      this._listSection.addMenuItem(section)
    }

    _confirmDelete(container) {
      if (this._confirmDialog) {
        if (typeof this._confirmDialog.close === 'function') this._confirmDialog.close()
        this._confirmDialog.destroy()
        this._confirmDialog = null
      }

      if (this.menu.isOpen) this.menu.close()

      const dialog = new Dialog.Dialog(Main.uiGroup, 'docker-confirm-dialog')
      const messageLayout = new Dialog.MessageDialogContent({
        title: 'Confirm Delete',
        description: `Delete container "${container.name}"?`,
      })
      dialog.contentLayout.add_child(messageLayout)

      let didSubmit = false
      dialog.addButton({
        label: 'No',
        isDefault: false,
        action: () => {
          if (typeof dialog.close === 'function') dialog.close()
          dialog.destroy()
        },
      })
      dialog.addButton({
        label: 'Yes',
        isDefault: true,
        action: () => {
          if (didSubmit) return
          didSubmit = true
          ;(async () => {
            try {
              const ok = await deleteContainer(container.id)
              if (!ok) {
                logError(new Error('Docker delete failed'), 'Docker Manager')
              }
            } catch (error) {
              logError(error, 'Docker Manager')
            } finally {
              if (typeof dialog.close === 'function') dialog.close()
              dialog.destroy()
              this.refresh()
            }
          })()
        },
      })

      this._confirmDialog = dialog

      const actor = dialog.actor ?? dialog
      if (actor) {
        actor.reactive = true
        actor.can_focus = true
      }

      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        const monitor = Main.layoutManager.primaryMonitor
        if (!monitor || !actor) return GLib.SOURCE_REMOVE
        const [minW, natW] = actor.get_preferred_width(-1)
        const [minH, natH] = actor.get_preferred_height(natW)
        const w = Math.max(minW, natW)
        const h = Math.max(minH, natH)
        const x = Math.floor(monitor.x + (monitor.width - w) / 2)
        const y = Math.floor(monitor.y + (monitor.height - h) / 2)
        actor.set_position(Math.max(monitor.x, x), Math.max(monitor.y, y))
        return GLib.SOURCE_REMOVE
      })

      if (typeof dialog.open === 'function') {
        dialog.open()
      } else if (typeof dialog.show === 'function') {
        dialog.show()
      }
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
  _getPanelPosition() {
    const value = this._settings?.get_string('panel-position')
    return value === 'left' || value === 'right' ? value : 'right'
  }

  _recreateIndicator() {
    if (this._indicator) {
      this._indicator.destroy()
      this._indicator = null
    }
    this._indicator = new DockerIndicator(this)
    Main.panel.addToStatusArea('docker-manager', this._indicator, 0, this._getPanelPosition())
    this._indicator.refresh()
  }

  enable() {
    this._settings = this.getSettings()
    this._recreateIndicator()
    this._settingsChangedId = this._settings.connect('changed::panel-position', () => {
      this._recreateIndicator()
    })
    this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
      if (this._indicator?.menu?.isOpen) {
        return GLib.SOURCE_CONTINUE
      }
      this._indicator.refresh()
      return GLib.SOURCE_CONTINUE
    })
  }

  disable() {
    if (this._settings && this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId)
      this._settingsChangedId = null
    }
    this._settings = null
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
