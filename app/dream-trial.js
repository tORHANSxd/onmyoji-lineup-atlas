((root, factory) => {
  const route = factory();
  if (typeof module === 'object' && module.exports) module.exports = route;
  else root.AtlasDreamTrial = route;
})(globalThis, () => {
  'use strict';
  // DramaHeroInfo and BattleMonstersInfo in resource 0.0.816.
  const heroes = [60592, 60583, 60338, 60591, 60575, 60577, 60573, 60300, 60376, 60282];
  const stages = Object.fromEntries(heroes.map((id, index) => [34266 + index, id]));
  return Object.freeze({
    resourceVersion: '0.0.816', battleMode: 9606, sceneId: 49017, turnLimit: 7,
    engine: Object.freeze({name: 'DreamSelfBattleEngine', route: 'dream-trial-fixed-roster',
      sha256: 'cefb92638d94b84ba0018c78322e6d0e8308b92d7626f75d3bf6d88ce29dc0ac'}),
    tableSHA256: Object.freeze({
      dream_act_hero: '468cb8bbe5fe22c26a2ef39a1bbfccbada6926898cab268b27091085d04577df',
      dream_act_battle_cond: '76b3f0e365637f64cad9160a431bd8dbf14675efa0135c5c9207a1678f67c8ad',
      DramaHeroInfo: 'da7e6abef115faaa932518efba0defbb51aca09c8df2a979a767b3b299e07b8e',
      BattleMonstersInfo: '8747286d03333c0073d5d2d72e3cec1e89a25f043efb920ee4fcaa8b55b29111',
      pve_stage_data: '7d376d64c733f53882acc6e88291a4607b6c290828981fbad7adc3dcf7ad36b0',
    }),
    heroId: stageId => stages[stageId],
  });
});
