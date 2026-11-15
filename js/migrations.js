/* Questy 2.0: миграция только копирует legacy-ключи.
 * Никаких сбросов баланса, прогресса или покупок.
 * VK Storage использует исходные имена и остаётся совместимым. */
function migrateLegacyStorage(){
  const fixed = ['balance','streak','best_streak','total_done','total_hard_done',
    'bonus_rerolls','bonus_rerolls_day','last_daily_claim','last_complete_date',
    'shared_once','owned_themes','current_theme','owned_frames','current_frame',
    'history','user_photo','user_name','mining','task_mode','personal_goals','goals_finished'];
  const daily = [stateKey(),unlocksKey(),'rerolls_'+dateKey()];
  try{
    for(const key of fixed.concat(daily)){
      if(localStorage.getItem('g_'+key) !== null) continue;
      const old = localStorage.getItem(key);
      if(old !== null) localStorage.setItem('g_'+key, old);
    }
    localStorage.setItem('questy_schema_version','2');
  }catch(e){ console.warn('[Questy migration]',e); }
}
