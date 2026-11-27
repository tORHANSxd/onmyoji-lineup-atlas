((root, factory) => {
  const source = factory();
  if (typeof module === 'object' && module.exports) module.exports = source;
  else root.AtlasBreakthrough = source;
})(globalThis, () => {
  'use strict';
  return Object.freeze({
    resourceVersion:'0.0.816', battleMode:4000, stageId:10020201, sceneId:100,
    layoutId:402, memberCount:5, refereeSwitch:2065,
    engine:Object.freeze({name:'JiejieTuPoSingleEngine', route:'personal-breakthrough-known-matchup',
      sha256:'8093647da718134bf9690e36752df2c334d4e97385ca99239be201506e8a8797'}),
    tableSHA256:Object.freeze({
      battle_mode_routes:'861d63b9444ad4f787b3984964b2d280f358bbed312fc5a04ea524e9e6c62d52',
      Combinesceneinfo:'304952ff63a7ed5bf2e3cd715bcd838e6c3e1e34ca9848a3442d199f7d380bf0',
      team_assist_stage:'be09e09b10982685db13ae74b3ef617b910b02295f9d88ba6356d7b5618d6720',
      dg_flaglevel:'89cca51581d7dd292487a1004370128c248967637f899b0d573e19f736d4b126',
      dg_flagmodify:'cee74a85e8a41b1c31f3e57bab0c3ecdba09fba751abddba7fec77d658d96d08',
    }),
  });
});
