import Adw from 'gi://Adw'
import Gtk from 'gi://Gtk'

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

export default class DockerManagerPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings()

    const page = new Adw.PreferencesPage()
    const group = new Adw.PreferencesGroup({
      title: 'Top Bar',
      description: 'Choose where the Docker icon is placed in the panel',
    })

    const positionRow = new Adw.ComboRow({
      title: 'Panel position',
      model: Gtk.StringList.new(['Left', 'Right']),
    })

    const current = settings.get_string('panel-position') === 'left' ? 0 : 1
    positionRow.selected = current

    positionRow.connect('notify::selected', row => {
      const value = row.selected === 0 ? 'left' : 'right'
      settings.set_string('panel-position', value)
    })

    group.add(positionRow)
    page.add(group)
    window.add(page)
  }
}
