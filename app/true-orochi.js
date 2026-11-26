(function(root,factory){
 const data=factory();
 if(typeof module==='object'&&module.exports)module.exports=data;else root.AtlasTrueOrochi=data;
})(globalThis,function(){
 'use strict';
 const stageId=71,firstFloor=25100,floorCount=10,battleMode=3005,sceneId=40007,codeStageId=10020228;
 const engineSHA256='6825de63c20c07c84bf2aeccedcdbf8272518a3e76e0d333515de11c2eb3b7f8';
 const isFloor=value=>Number.isSafeInteger(value)&&value>=firstFloor&&value<firstFloor+floorCount;
 return {stageId,firstFloor,floorCount,battleMode,sceneId,codeStageId,engineSHA256,isFloor};
});
