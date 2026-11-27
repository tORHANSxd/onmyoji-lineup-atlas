((root, factory) => {
  const common=typeof module==='object'&&module.exports;
  const source=factory(common?require('./breakthrough.js'):root.AtlasBreakthrough);
  if(common)module.exports=source;
  else root.AtlasDojoDefense=source;
})(globalThis, breakthrough => {
  'use strict';
  function validOmissions(slots,leader){
    return Array.isArray(slots)&&slots.length<=4&&new Set(slots).size===slots.length&&
      (!slots.length||leader)&&slots.every(slot=>Number.isInteger(slot)&&slot>=2&&slot<=6);
  }
  function validPlan(settings){
    return !!settings&&Object.keys(settings).length===3&&typeof settings.leader==='boolean'&&
      Number.isInteger(settings.partySize)&&Object.hasOwn(breakthrough.partySlots,settings.partySize)&&
      Array.isArray(settings.waves)&&settings.waves.length>0&&Array.from(settings.waves).every(wave=>
        !!wave&&Object.keys(wave).length===3&&!!wave.onmyoji&&Array.isArray(wave.members)&&
        validOmissions(wave.omittedSlots,settings.leader)&&wave.members.length===5-wave.omittedSlots.length);
  }
  return Object.freeze({
    resourceVersion:'0.0.816',battleMode:4003,stageId:10020203,sceneId:100,memberCount:5,
    partySlots:breakthrough.partySlots,validOmissions,validPlan,
    engine:Object.freeze({name:'JiejieTuPoGym2S1Engine',route:'dojo-known-defense-sequence',
      sha256:'aa7b106b5ba37028b42fea7dda68f969446b773a9500176642e0ec143f353948'}),
    tableSHA256:Object.freeze({
      battle_mode_routes:'861d63b9444ad4f787b3984964b2d280f358bbed312fc5a04ea524e9e6c62d52',
      team_assist_stage:'be09e09b10982685db13ae74b3ef617b910b02295f9d88ba6356d7b5618d6720',
      Combinesceneinfo:'304952ff63a7ed5bf2e3cd715bcd838e6c3e1e34ca9848a3442d199f7d380bf0',
      dg_flaglevel_new:'0a5776f5d0f262a716154d7d280d804132c4b93a5a079526b92b00ef1364c1dc',
      dg_flagmodify_new:'bcb93a0cd50fd5a69cd0795123add6fbe78144630f54286fb2c0b88bb63f5cef',
    }),
  });
});
