# Плагин шаблоны

1. Қалтаны көшіріңіз, `manifest.json`-да `id` (бірегей, кері домен: `kz.сіздің-атыңыз.плагин`), `name`, `author` өзгертіңіз.
2. `main.js`-та командаларды жазыңыз (`mura.commands.register`), олардың атауы `contributes`-тағы `command`-пен бірдей болсын.
3. Тексеру: `node ../tools/validate.mjs . --app 2.2.0`; жергілікті іске қосу: `node ../tools/run.mjs . hello`.
4. Жинау: `node ../tools/pack.mjs .` → `dist/kz.example.hello-1.0.0.muraplug`; Mura GIS: «Баптаулар → Плагиндер → Плагин орнату».
