# Docker Manager (GNOME Shell Extension)

Estensione per GNOME Shell che sfrutta i comando docker per la gestione dei container docker.

## Funzionalità

- Nella topbar c'e' l'icona di docker in azzurro con un numero che mostra i container attivi
- Click sinistro: popup con la lista dei container attivi
  - Nel popup una spunta mostra anche i container non attivi
  - Ogni voce della lista individua un container che puo' essere messo avviato, interrotto, riavviato o eliminato
- Click destro: menu con voce **Settings**.

## Screenshot

## Installazione

1. Clona o copia la cartella dell’estensione in:
   `~/.local/share/gnome-shell/extensions/docker-manager@sydro.github.com`
2. Compila lo schema GSettings:
   ```bash
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/docker-manager@sydro.github.com/schemas
   ```
3. Abilita l’estensione:
   ```bash
   gnome-extensions enable docker-manager@sydro.github.com
   ```
4. Se necessario, riavvia GNOME Shell (Alt+F2, poi `r`) o effettua logout/login (Wayland).

## Sviluppo

Se lavori nel repository, puoi usare un symlink verso la directory di GNOME Shell:

```bash
ln -sfn "$(pwd)" ~/.local/share/gnome-shell/extensions/docker-manager@sydro.github.com
```
