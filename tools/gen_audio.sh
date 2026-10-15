#!/bin/bash
# Generate music + voice (fast calls), sequentially to be gentle with the API.
set -u
cd "$(dirname "$0")/.."
mkdir -p src/assets/audio

mus() {
  local out="$1"; shift
  local prompt="$*"
  if [ -s "src/assets/audio/$out" ]; then echo "SKIP $out"; return 0; fi
  for attempt in 1 2 3; do
    if varlik music "$prompt" --out "src/assets/audio/$out" >/dev/null 2>&1 && [ -s "src/assets/audio/$out" ]; then
      echo "OK $out"; return 0
    fi
    echo "RETRY$attempt $out"; sleep 3
  done
  echo "FAIL $out"
}

vox() {
  local out="$1"; local voice="$2"; local style="$3"; local text="$4"
  if [ -s "src/assets/audio/$out" ]; then echo "SKIP $out"; return 0; fi
  for attempt in 1 2 3; do
    if varlik voice "$text" --voice "$voice" --style "$style" --out "src/assets/audio/$out" >/dev/null 2>&1 && [ -s "src/assets/audio/$out" ]; then
      echo "OK $out"; return 0
    fi
    echo "RETRY$attempt $out"; sleep 3
  done
  echo "FAIL $out"
}

mus mus-menu.ogg "Moody whimsical dark fairy-tale waltz, music box melody, cello, soft crackling embers, mysterious and slightly melancholy, instrumental, seamless loop, 100 bpm"
mus mus-stage1.ogg "Driving folk adventure, hand drums, fiddle, acoustic guitar, mysterious mossy forest mood, energetic percussion, instrumental, seamless loop, 122 bpm"
mus mus-stage2.ogg "Dark drippy cellar groove, deep pulsing bass, sparse detuned piano, water drop percussion, tense and slithering, instrumental, seamless loop, 108 bpm"
mus mus-stage3.ogg "Intense stormy industrial orchestral hybrid, taiko drums, distorted cello ostinato, metallic percussion, driving and epic, instrumental, seamless loop, 138 bpm"
mus mus-boss.ogg "Heavy boss battle music, aggressive orchestral rock, pounding drums, brass stabs, urgent string runs, instrumental, seamless loop, 145 bpm"
mus mus-finalboss.ogg "Epic apocalyptic final boss battle, full orchestra with dark choir, thunderous percussion, relentless and huge, instrumental, seamless loop, 150 bpm"
mus mus-victory.ogg "Warm triumphant orchestral resolution, gentle piano and swelling strings, hopeful and cozy, fireplace warmth, instrumental, 90 bpm"
mus mus-gameover.ogg "Somber short piano elegy with soft rain sounds, sad but with a hopeful final chord, instrumental, 70 bpm"

NARR="Gacrux"
NARR_STYLE="a deep, warm, dramatic storyteller voice, slow and rich, like narrating a dark fairy tale"
vox vox-intro1.ogg "$NARR" "$NARR_STYLE" "In the cupboard under the stairs, in a box of one hundred matches, only one remained unstruck. His name... was Novaki."
vox vox-intro2.ogg "$NARR" "$NARR_STYLE" "But the Damp is rising. It has drowned the cellar, swallowed the garden of crumbs, and now it comes for the last warm thing in the house."
vox vox-intro3.ogg "$NARR" "$NARR_STYLE" "Novaki does not run from the wet. Novaki burns."
vox vox-stage2.ogg "$NARR" "$NARR_STYLE" "Below the floorboards, the pipes weep black water. Something down there has been drinking the dark for years."
vox vox-stage3.ogg "$NARR" "$NARR_STYLE" "High above the house, the Soakfather turns his great wheel, and the rain never ends. Go. End it."
vox vox-post1.ogg "$NARR" "$NARR_STYLE" "The thicket falls silent. Below, the water waits."
vox vox-post2.ogg "$NARR" "$NARR_STYLE" "The pipes run dry. Above, the storm rages on."
vox vox-ending1.ogg "$NARR" "$NARR_STYLE" "And with one small, stubborn flame, Novaki lit the Great Hearth."
vox vox-ending2.ogg "$NARR" "$NARR_STYLE" "The Damp hissed, and shrank, and was gone. The house was warm again. All of it. Because of one... last... spark."
vox vox-gameover.ogg "$NARR" "$NARR_STYLE" "The flame gutters... but a match is never truly out. Strike again."

vox vox-mossmaw-intro.ogg "Algenib" "a guttural, gravelly beast voice, hungry and slow, slightly gurgling" "Mmm... a morsel of kindling crawls into MY thicket! I will mulch you to mush!"
vox vox-mossmaw-death.ogg "Algenib" "a guttural gravelly beast voice, now wounded and afraid" "No... not the fire... NOT THE FIRE...!"
vox vox-clog-intro.ogg "Umbriel" "a gurgling, wet, bubbly voice, like someone talking through water" "Glub... glub... you drip into my pipes, little match? I will swallow you WHOLE."
vox vox-clog-death.ogg "Umbriel" "a gurgling wet bubbly voice, draining away, fading" "I am... draining... awayyyy..."
vox vox-soak-intro.ogg "Charon" "a slow, regal, menacing deep villain voice with cold contempt" "A spark? In MY storm? I have drowned a thousand suns, little stick. You are nothing."
vox vox-soak-taunt.ogg "Charon" "a slow regal menacing deep villain voice, commanding" "Rain! Drown him!"
vox vox-soak-death.ogg "Charon" "a deep regal villain voice, broken and disbelieving, fading" "Impossible... the rain... was... forever..."
vox vox-novaki-start.ogg "Zubenelgenubi" "a grumpy, deadpan, dry young male voice, slightly nasal" "Right. Let's burn something."
vox vox-novaki-levelup.ogg "Zubenelgenubi" "a grumpy deadpan dry young male voice, mild approval" "Ha. Warmer already."
vox vox-novaki-victory.ogg "Zubenelgenubi" "a grumpy deadpan dry young male voice, quietly proud" "Told you. I burn."

echo "AUDIO ALL DONE"
