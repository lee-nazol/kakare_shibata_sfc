(() => {
  'use strict';
  const STORAGE_KEY = 'kakare:controls:v1';
  const defaults = {
    up: ['ArrowUp','KeyW'],
    down: ['ArrowDown','KeyS'],
    left: ['ArrowLeft','KeyA'],
    right: ['ArrowRight','KeyD'],
    attack: ['Space','KeyJ'],
    pause: ['KeyP','Escape']
  };
  function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
  function load(){
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed) return clone(defaults);
      const merged = clone(defaults);
      Object.keys(merged).forEach(k => {
        if (Array.isArray(parsed[k]) && parsed[k].length >= 2) merged[k] = parsed[k].slice(0,2);
      });
      return merged;
    } catch(e){ return clone(defaults); }
  }
  function save(cfg){ localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
  function reset(){ save(defaults); return clone(defaults); }
  function matches(code, action, cfg=load()){ return (cfg[action] || []).includes(code); }
  function label(code){
    const map = {
      ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'SPACE',Escape:'ESC',
      KeyW:'W',KeyA:'A',KeyS:'S',KeyD:'D',KeyJ:'J',KeyP:'P',Enter:'ENTER',ShiftLeft:'SHIFT',ShiftRight:'SHIFT'
    };
    return map[code] || code.replace(/^Key/,'').replace(/^Digit/,'');
  }
  window.KAKARE_CONFIG = {STORAGE_KEY, defaults:clone(defaults), load, save, reset, matches, label};
})();
