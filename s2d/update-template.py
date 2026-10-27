"""Apply the approved S2D mobile interface changes to the recovered template."""
from pathlib import Path


def main() -> None:
    """Replace known baseline elements, failing on a mismatched baseline."""
    path = Path(__file__).with_name("template.html")
    html = path.read_text()
    replacements = {
        '<script>__OPENCV_JS__</script>': '<script id="opencv-source" type="text/plain">__OPENCV_JS__</script>',
        '<script>__VISION_JS__</script>': '<script id="vision-source">__VISION_JS__</script>',
        '<script>__APP_JS__</script>': '<script id="image-worker-source" type="text/plain">__IMAGE-WORKER_JS__</script><script>__APP_JS__</script><script>__EXTRAS_JS__</script>',
        '<div class="preview"><img id="largePreview" alt="Ausgewählte Dokumentseite"></div>': '<button id="openLargePreview" class="preview" aria-label="Ausgewählte Seite groß anzeigen"><img id="largePreview" alt="Ausgewählte Dokumentseite"></button>',
        'Intensität der Verbesserung <input': 'Intensität <output id="strengthValue">100 %</output><input',
        '<button id="rotatePage">Drehen</button>': '<button id="rotateLeft" aria-label="90 Grad nach links drehen">↶ Links</button><button id="rotateRight" aria-label="90 Grad nach rechts drehen">↷ Rechts</button>',
        'Seiten an den Griffen unter den Miniaturen verschieben. Die Werkzeuge gelten für die ausgewählte Seite.': 'Miniatur antippen: Vollansicht. Gedrückt halten und ziehen: sortieren.',
        '<label><input id="rememberRule" type="checkbox" checked> Ausgewählten Ordner für diesen Absender merken</label>': '',
        '<span id="folderLabel" class="hint"></span></div></div>': '</div><div class="folder-row"><span></span><span id="folderLabel" class="hint"></span></div></div>',
        'Die vier Eckpunkte an die Blattkanten ziehen. Ungültige oder gekreuzte Ecken werden nicht übernommen. Ein neuer Zuschnitt setzt Retuschen dieser Seite zurück.': 'Ecken frei ziehen; Seitenkanten parallel verschieben. Gelb: verbleibender Bereich nach Sicherheitsbeschnitt. Neuer Zuschnitt setzt Retuschen zurück.',
        '<option value="0.01">1 %</option></select>': '<option value="0.01">1 %</option><option value="0.015">1,5 %</option><option value="0.02">2 %</option><option value="0.03">3 %</option><option value="0.04">4 %</option><option value="0.05">5 %</option></select>',
        '<div id="ruleList"></div>': '<label><input id="ocrEnglish" type="checkbox"> OCR zusätzlich auf Englisch (mehr Rechenaufwand)</label><p class="hint">Standard: Deutsch. OCR beginnt beim Verlassen einer bearbeiteten Seite oder mit „Weiter“. Unveränderte Ergebnisse werden wiederverwendet.</p><div id="ruleList"></div>',
    }
    for old, new in replacements.items():
        if old not in html:
            raise ValueError(f"Baseline element missing: {old[:90]}")
        html = html.replace(old, new)
    css = """
/* S2D interaction update: compact review card, no blocking busy overlay. */
.thumb,.large-single .thumb{width:110px;flex-basis:110px;padding:3px}.thumb button{display:flex;flex-direction:column;gap:3px;touch-action:pan-x;user-select:none;-webkit-user-select:none}.thumb img,.large-single .thumb img{width:100%;height:138px;display:block;pointer-events:none}.thumb span{width:100%;height:20px;line-height:20px;overflow:hidden}.thumb.dragging{outline:3px dashed #205f9d;opacity:.65}.strip{scrollbar-width:thin;min-height:160px}.preview{width:100%;min-height:0;overflow:hidden;border:0}.preview img{height:100%;max-height:100%;max-width:100%;object-fit:contain}.tools{grid-template-columns:1fr 1fr;gap:10px;padding-top:6px}.tools label{font-size:.85rem;position:relative}.tools output{position:absolute;right:0;top:0;font-variant-numeric:tabular-nums}.tools .actions{grid-column:1/-1;display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:2px 0}.tools button{padding:.6rem .3rem;min-height:44px;font-size:.85rem}#reviewStep{height:min(820px,calc(100svh - 86px));min-height:420px;display:flex;flex-direction:column;gap:6px;scroll-margin-top:74px}#reviewStep .preview{flex:1}#reviewStep h2{margin:0;font-size:1rem}#reviewStep .step{display:none}#reviewStep p.hint{margin:0;font-size:.75rem;line-height:1.25}#reviewStep .footer{margin-top:3px}#reviewStep .footer button{padding:.6rem}#cropStatus{max-height:2.5em;overflow:auto}input[type=range]{padding:0;min-height:38px;accent-color:#205f9d}#saveStep .field{grid-template-rows:auto 48px;align-content:start}#saveStep .field select,#saveStep .field button{height:48px;min-height:48px}#saveStep .fields{row-gap:8px}.folder-row{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:16px;min-height:1.5em}#folderHint{margin-top:22px}#activity{position:fixed;right:12px;top:70px;z-index:110;background:#fffef1;border:1px solid #bfcfdd;box-shadow:0 2px 10px #1232;border-radius:18px;padding:8px 12px;font-size:.8rem;display:flex;align-items:center;gap:8px;pointer-events:none}.spinner{width:17px;height:17px;border:2px solid #c6d8e7;border-top-color:#205f9d;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}dialog{border:1px solid #c8d7e3;border-radius:16px;padding:20px;max-width:calc(100vw - 24px);color:#183650}dialog::backdrop{background:#10253599}#viewer{width:100vw;height:100svh;max-width:100vw;max-height:100svh;margin:0;border:0;border-radius:0;padding:12px;background:#132635;color:white;overflow:hidden}#viewer .viewer-header{height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px}#viewerStage{height:calc(100% - 72px);display:flex;justify-content:center;align-items:center;overflow:hidden;touch-action:none}#viewerImage{max-width:100%;max-height:100%;object-fit:contain;user-select:none;pointer-events:none}#viewer p{margin:4px;font-size:.75rem;color:#c4d8e8}#cropLoupe{position:fixed;width:140px;height:140px;border:3px solid white;border-radius:50%;box-shadow:0 3px 18px #0008;z-index:150;pointer-events:none}.editor-stage.crop{height:calc(100svh - 290px);min-height:220px}#cropView{padding:12px}#cropView h2{margin-top:0}#cropView .hint{font-size:.8rem;margin:5px 0}#cropView .actions{margin:8px 0;align-items:center}#cropView .actions button{padding:.6rem}#cropView .actions label{display:flex;align-items:center;gap:8px}#cropView select{width:auto}#saveChoice .actions{display:grid;grid-template-columns:1fr}
@media(max-width:600px){.tools{grid-template-columns:1fr 1fr}#reviewStep{padding:10px;gap:5px}#reviewStep .tools label{font-size:.78rem}#reviewStep .tools select{padding:.6rem .25rem;font-size:.82rem}.tools .actions{grid-template-columns:repeat(3,1fr)}.tools .actions button:nth-child(-n+2){grid-column:auto}.thumb,.large-single .thumb{width:98px;flex-basis:98px}.thumb img,.large-single .thumb img{height:120px}.strip{min-height:147px}#saveStep .fields{grid-template-columns:1fr 1fr;gap:8px}#saveStep .field button{font-size:.8rem;padding:.4rem}.folder-row{gap:8px}#activity{top:65px;max-width:80vw}#cropView .actions{gap:5px}#cropView .actions button{font-size:.8rem}.editor-stage.crop{height:calc(100svh - 290px)}}
"""
    html = html.replace("</style>", css + "</style>")
    overlays = """<div id="activity" role="status" hidden><span class="spinner" aria-hidden="true"></span><span id="activityText"></span></div>
<canvas id="cropLoupe" width="180" height="180" hidden aria-hidden="true"></canvas>
<dialog id="viewer" aria-labelledby="viewerTitle"><div class="viewer-header"><strong id="viewerTitle">Seite</strong><button id="viewerClose">Zurück</button></div><div id="viewerStage"><img id="viewerImage" alt="Ganzseitenansicht"></div><p>Zwei Finger: Zoom · Ziehen: verschieben · Doppeltippen: Zoom · Zurück: Bearbeitung</p></dialog>
<dialog id="saveChoice" aria-labelledby="saveChoiceTitle"><h2 id="saveChoiceTitle">Zielordner zuordnen</h2><p id="saveChoiceText"></p><div class="actions"><button id="saveRemember" class="primary">Speichern und merken</button><button id="saveOnce">Nur diesmal speichern</button><button id="saveCancel">Abbrechen</button></div></dialog>
"""
    html = html.replace('<script id="embedded-assets"', overlays + '<script id="embedded-assets"')
    path.write_text(html)


if __name__ == "__main__":
    main()
