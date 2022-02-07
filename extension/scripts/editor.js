blockliveId = null
console.log('CollabLive Editor Inject Running...')


function sleep(millis) {
    return new Promise(res => setTimeout(res, millis));
}
///.......... BG SCRIPT CONNECTION SETUP ..........//

var exId = 'gldgilbeipcefapiopheheghmjbgjepb'

// Connect To Background Script
var port = chrome.runtime.connect(exId);
var isConnected = true;

function liveMessage(...args) {
    reconnectIfNeeded()
    port.postMessage(...args)
}

function blockliveListener(msg) {
    if(msg.meta=="blockly.event") {
        runEventFromMessageData(msg.data)
    } else if (msg.meta=="sprite.proxy") {
        proxyActions[msg.data.name](...(['linguini'].concat(msg.data).concat(msg.data.args)))
    } else if (msg.meta =="vm.blockListen") {
        onBlockRecieve(msg)
    } else if (msg.meta =="hihungryimdad") {
        blockliveId = msg.id
    } else if (msg.meta == "messageList") {
        msg.messages.forEach(message=>{blockliveListener(message)})
    } else if (msg.meta == "vm.shareBlocks") {
        doShareBlocksMessage(msg)        
    }
}


function registerChromePortListeners() {
    port.onMessage.addListener(blockliveListener);
    port.onDisconnect.addListener(()=>{
        isConnected = false;
    })
}
registerChromePortListeners()

function reconnectIfNeeded() {
    if(!isConnected) {
        port = chrome.runtime.connect(exId); 
        isConnected = (!!port); 
        if(isConnected){
            registerChromePortListeners();
            liveMessage({meta:"whydidyounamemethisway",id:blockliveId})
        }
    }
}



///.......... TRAPS ..........//

// Trap ScratchBlocks -- adapted from https://github.com/ScratchAddons/ScratchAddons/blob/4248dc327a9f3360c77b94a89e396903218a2fc2/addon-api/content-script/Trap.js
function sleep(millis) {
    return new Promise(res=>setTimeout(res,millis));
}

function getObj(lambda) {
    return new Promise(async res=>{
        let output;
        while(!(output = lambda())) {
            console.log('waiting for lambda resolve: ' + lambda)
            await sleep(100)
        }
        res(output);
    })
}

(async()=>{
let reactElem = (await getObj(()=>document.querySelector('[class^="gui_blocks-wrapper"]')))
let reactInst;
for(let e of Object.entries(reactElem)) {
    if(e[0].startsWith('__reactInternalInstance')) {
        reactInst = e[1];
        break;
    }
}

let childable = reactInst;
/* eslint-disable no-empty */
while (((childable = childable.child), !childable || !childable.stateNode || !childable.stateNode.ScratchBlocks)) {}

ScratchBlocks = childable.stateNode.ScratchBlocks;

// Send Trapped Message
liveMessage({meta:"sb.trapped"}, function (response) {
    console.log("response: " + response)
});
})()

// Thanks garbomuffin and scratchaddons
let vm = Object.values(document.querySelector('div[class^="stage-wrapper_stage-wrapper_"]')).find((x) => x.child)
.child.child.child.stateNode.props.vm;



///.......... ALL THE HACKY THINGS ..........//

function getWorkspace() {
    let retVal = null
    Object.entries(ScratchBlocks.Workspace.WorkspaceDB_).forEach(wkv=>{
        if(!wkv[1].isFlyout) {retVal = wkv[1]}
    })
    return retVal;
}
function getWorkspaceId() {
    return getWorkspace()?.id
}

proxyActions = {}
//action: vm action function
//name: name to put in recort
//mutator: args generator from recieved data object (has args field)
//then: callback for those replaying action

// mutator takes data object {name, args, extrargs} and returns args list

let prevTarg = null
function editingProxy(action,name,extrargs,mutator) {
    return proxy(action,name,
        ()=>({target:vm.editingTarget.sprite.name}),null,
        (data)=>{
            prevTarg = vm.editingTarget
            vm.editingTarget = vm.runtime.getSpriteTargetByName(data.extrargs.target)
            vm.runtime._editingTarget = vm.editingTarget
        },
        (data)=>{
            vm.editingTarget = prevTarg;
            vm.runtime._editingTarget = prevTarg
        },extrargs,mutator)
}

function proxy(action,name,extrargs,mutator,before,then,dontSend,dontDo) {
    return anyproxy(vm,action,name,extrargs,mutator,before,then,dontSend,dontDo)
}
function anyproxy(bindTo,action,name,extrargs,mutator,before,then,dontSend,dontDo) {
    let proxiedFunction =function(...args) {
        if(args[0]=='linguini') {
// if linguini, ...args are ['linguini', data, data.args]
            args.splice(0,1)
            let data = args.splice(0,1)[0]
            // console.log('data:')
            // console.log(data)
            if(mutator){args = mutator(data)}
            // else {args = data.args}

            let prevTarget = vm.editingTarget
            if(!!before) {before(data)}
            console.log('args:')
            console.log(...args)
            if(dontDo?.(data)) {return}
            proxiedArgs = args
            let retval = action.bind(bindTo)(...args)
            if(then) {
                if(!!retval?.then) {
                    // if returns a promise
                        retval.then(()=>{then(prevTarget,vm.editingTarget)})
                    } else {
                    // if is normal resolved function
                        then(prevTarget,vm.editingTarget)
                    }
            }
            return retval
        } else {
            console.log('intrecepted:')
            console.log(...args)
            let extrargsObj = null;
            if(!!extrargs) {extrargsObj=extrargs(args)}
            proxiedArgs = args

            let retval = action.bind(bindTo)(...args)
            if(!dontSend?.(...args)) { liveMessage({meta:"sprite.proxy",data:{name,args,extrargs:extrargsObj}}) }
            return retval
        }
    }
    proxyActions[name] = proxiedFunction;
    return proxiedFunction;
}
function stProxy(action,name,extrargs,mutator,before,then,dontSend,dontDo) {
    return proxy(action,name,
        (args)=>({__et:vm.editingTarget.sprite.name,...extrargs?.(args)}),
        mutator,
        // before,
        (data)=>{before?.(data);vm.runtime.setEditingTarget(vm.runtime.getSpriteTargetByName(data.extrargs.__et))},
        (a,b)=>{vm.runtime.setEditingTarget(a);then?.(a,b)},
        // then,
        dontSend);
        // (data)=>{before?.(data);vm.runtime.setEditingTarget(vm.runtime.getSpriteTargetByName(data.extrargs.__et))},
        // (a,b)=>{vm.runtime.setEditingTarget(a);then?.(a,b)},quit);
}

// todo catch shadow create
function isBadToSend(event, target) {
    switch(event.type) {
        // filter out shadow events that shouldnt be proxied
        case 'create': if(event.xml.nodeName == "SHADOW") {return true}
        case 'delete': if(event.oldXml?.nodeName == "SHADOW") {return true}
        case 'move' : {
            let block = target.blocks.getBlock(event.blockId)
            if(block?.shadow) {return true}

            // edge case: c1 move unlinked var block into parent block. c2 blocklive mistakenly moves a linked block into that place. c2 moves linked block out of the parent block and does not move out of c1
            // dont send if moves a varible to same position
            // if(!!block && (block.fields.VARIABLE || block.fields.LIST)) {
            //     if(!!event.oldCoordinate && !!event.newCoordinate && (
            //         Math.round(event.oldCoordinate.x) == Math.round(event.newCoordinate.x) &&
            //         Math.round(event.oldCoordinate.y) == Math.round(event.newCoordinate.y)
            //     )) {return true}
            // }
        }
    }
    return false
}

// Todo catch bad deletes (var, comment)
// get current drag id
// ScratchBlocks.getMainWorkspace().getBlockDragSurface().getCurrentBlock()?.getAttribute('data-id')

function isBadToRun(event, target) {
    switch (event.type) {
        // dont run if block already exists
        case 'create': return !!target.blocks.getBlock(event.blockId);
        case 'delete': return !target.blocks.getBlock(event.blockId);
        // dont run if comment already exists
        case 'comment_create': return event.commentId in target.comments;
        case 'move': {
            // dont run if block doesnt exist
            if(!target.blocks.getBlock(event.blockId)) return true;
            // dont run if block is already close enough to position (rounded to 1's place)
            // ...and make sure that the event specifies x and y before checking!
            if(!!event.newCoordinate?.x && !!event.newCoordinate?.y) {
                let localBlock = target.blocks.getBlock(event.blockId)
                if(Math.round(localBlock.x)== Math.round(event.newCoordinate.x) &&
                Math.round(localBlock.y) == Math.round(event.newCoordinate.y))
                { return true; }
            }
            // dont run if newParentId is the same (assuming exists)
            if(!!event.newParentId) {
                let localBlock = target.blocks.getBlock(event.blockId)
                if(localBlock.parent == event.newParentId){return true;}
            }
        }
    }
    return false;
}
// Interface with ScratchBlocks object
function isBadToRunBlockly(event,workspace) {
    switch (event.type) {
        // dont run if block already exists
        case 'create': return !!workspace.getBlockById(event.blockId)
    }
    
}

function getStringEventRep(e) {
    let rep = e.type + e.blockId + e.commentId + e.varId
    switch(e.type) {
        case 'move':
            rep += Math.round(e.newCoordinate?.x)
            + Math.round(e.newCoordinate?.y)
            + e.newParentId
            break;
        case 'change':
            rep += e.name + e.newValue + e.element
            break;
        case 'var_create':
            rep += e.varName + e.isCloud + e.isLocal
            break;
        case 'var_rename':
            rep += e.newName
            break;
        case 'comment_change':
            rep += JSON.stringify(e.newContents_,(k,v)=>(v?.toFixed ? Number(v.toFixed(0)) : v))
            break;
        case 'comment_move':
            rep += Math.round(e.newCoordinate_?.x)
            + Math.round(e.newCoordinate_?.y)
            break;
    }
    return rep.replaceAll("undefined","null")
}

oldBlockListener = vm.blockListener
blockliveEvents = {}
createEventMap = {}
toBeMoved = {}
function blockListener(e) {
    console.log('just intrecepted',e)
    if(e.type == 'ui'){uiii = e}
    if(e.type == 'create'){createe = e}
    if(e.type == 'delete'){deletee = e}
    if(e.type == 'change'){changee = e}
    if(e.type == 'move'){movee = e}
    if(e.type == 'comment_change'){comee = e}
    // filter ui events and blocklive
    let stringRep = getStringEventRep(e)
    if(stringRep in blockliveEvents) {delete blockliveEvents[stringRep]}
    else if(
        !e.isBlocklive && 
        ["endDrag",'ui','dragOutside'].indexOf(e.type) == -1 &&
        !isBadToSend(e,vm.editingTarget) &&
        e.element != 'stackclick'
    ) {
        let extrargs = {}
        
        // send variable locator info
        if(e.type == 'move') {
            let block = vm.editingTarget.blocks.getBlock(e.blockId)
            if(!!block && (block.fields.VARIABLE || block.fields.LIST)) {
                extrargs.blockVarId = block.fields.VARIABLE ? block.fields.VARIABLE.id : block.fields.LIST.id
            }
        } else if(e.type == 'change' && (e.name == "VARIABLE" || e.name == "LIST")){
            let block = vm.editingTarget.blocks.getBlock(e.blockId)
            if(!!block) {
                extrargs.blockVarId = e.oldValue
                extrargs.blockVarParent = block.parent
                extrargs.blockVarPos = {x:block.x,y:block.y}
                extrargs.blockVarInput = vm.editingTarget.blocks.getBlock(block.parent)?.inputs.find(input=>(input.block==e.blockId))?.name
            }
        } else if(e.type == 'delete' && (
            e.oldXml?.firstElementChild?.getAttribute('name') == 'VARIABLE' ||
            e.oldXml?.firstElementChild?.getAttribute('name') == 'LIST'
        )) {
            let block = !!vm.editingTarget.blocks._blocks[e.blockId] ? vm.editingTarget.blocks._blocks[e.blockId] : lastDeletedBlock
            extrargs.blockVarId = block.fields.VARIABLE ? block.fields.VARIABLE.id : block.fields.LIST.id
            extrargs.blockVarParent = block.parent
            extrargs.blockVarPos = {x:block.x,y:block.y}
            extrargs.blockVarInput = vm.editingTarget.blocks.getBlock(block.parent)?.inputs.find(input=>(input.block==e.blockId))?.name
        }

        // send field locator info
        if(e.element == 'field') {
            if(vm.editingTarget.blocks.getBlock(e.blockId).shadow) {
            let fieldInputId = e.blockId
            let fieldInput = vm.editingTarget.blocks.getBlock(fieldInputId)
            let parentId = fieldInput.parent
            if(!!parentId) {
                let parentBlock = vm.editingTarget.blocks.getBlock(parentId)
                let inputTag = Object.values(parentBlock.inputs).find(input=>input.shadow==fieldInputId).name

                extrargs.parentId = parentId
                extrargs.fieldTag = inputTag
            }
            }
        }

        // send block xml-related things
        if(!!e.xml) {
            extrargs.xml = {outerHTML:e.xml.outerHTML}
            extrargs.isCBCreateOrDelete = e.xml?.getAttribute('type') == 'procedures_definition'
        }
        if(!!e.oldXml) {
            extrargs.isCBCreateOrDelete = extrargs.isCBCreateOrDelete || e.oldXml?.getAttribute('type') == 'procedures_definition'
        }

        console.log("sending",e,extrargs)

        let message = {meta:"vm.blockListen",type:e.type,extrargs,event:e,json:e.toJson(),target:vm.editingTarget.sprite.name,}
        
        // intercept and save create events to send later
        if(e.type == "create") {
            createEventMap[e.blockId] = message
        // } else if (e.type == 'comment_create') { //TODO: maybe add back
        //     createEventMap[e.commentId] = message
        // intercept auto generated move event
        } else if ((e.type == 'move') && e.blockId in toBeMoved){
            let moveEvents = toBeMoved[e.blockId]
            console.log("move events",moveEvents)
            delete toBeMoved[e.blockId]
            moveEvents.forEach(moveMessage=>onBlockRecieve(moveMessage))
        }
        else {
            // send held off create events
            if(e.blockId in createEventMap) {
                // erase from face of existance
                if(e.type == 'delete') {
                    message = null
                } else { 
                    liveMessage(createEventMap[e.blockId]) 
                }
                delete createEventMap[e.blockId]
            }
            if(e.commentId in createEventMap) {
                if(e.type == 'comment_delete') {
                    message = null
                } else { 
                    liveMessage(createEventMap[e.commentId]) 
                }
                delete createEventMap[e.commentId]
            }
            if(!!message){liveMessage(message)}
        }
    }
    // ___DONT___ Forward (do) event
    // oldBlockListener(e)
}
// vm.blockListener = blockListener
getObj(()=>(typeof ScratchBlocks != 'undefined')).then(()=>{getWorkspace().addChangeListener(blockListener)})

/// Todo: testing on whether or not to actually execute actions
// Todo: catch stage not being sprite
// Remove thing from undo list

function getDistance(p1,p2) {
    return Math.sqrt(Math.pow(p2.x-p1.x,2) + Math.pow(p2.y-p1.y,2))
}

function onBlockRecieve(d) {
    console.log("recieved", d)

    // for comment parsing cause they did the toJson wrong apparently
    if(d.type == 'comment_change') {
        d.json.newValue = d.json.newContents
    }

    let oldEditingTarget = vm.editingTarget
    // set editing target
    vm.editingTarget = vm.runtime.getSpriteTargetByName(d.target)
    vm.runtime._editingTarget = vm.editingTarget
    let vEvent = d.event
    let bEvent = ScratchBlocks.Events.fromJson(d.json,getWorkspace())
    //set blockly event tag
    bEvent.isBlocklive = true

    //........... Modify event ...........//

    // set vm type
    vEvent.type = d.type

    // find true variable block if needed
    if(d.extrargs.blockVarId && !(d.event.blockId in toBeMoved) && !vm.editingTarget.blocks.getBlock(d.event.blockId)) {
        if(d.event.oldParentId || d.extrargs.blockVarParent) {
            let oldParentId = d.extrargs.blockVarParent ? d.extrargs.blockVarParent : d.event.oldParentId
            let realId = vm.editingTarget.blocks.getBlock(oldParentId).inputs[d.extrargs.blockVarInput ? d.extrargs.blockVarInput : d.event.oldInputName].block
            vEvent.blockId = realId;
            bEvent.blockId = realId;
            if(d.type == 'delete') {
                bEvent.ids = [realId];
                vEvent.ids = [realId];
            }
        } else if(d.event.oldCoordinate || d.extrargs.blockVarPos) {
            let oldCoordinate = d.extrargs.blockVarPos ? d.extrargs.blockVarPos : d.event.oldCoordinate
            let varBlocks = vm.editingTarget.blocks._scripts.filter((blockId)=>{
                let block = vm.editingTarget.blocks.getBlock(blockId)
                return (
                    block?.fields?.VARIABLE?.id == d.extrargs.blockVarId ||
                    block?.fields?.LIST?.id == d.extrargs.blockVarId
                )
            })
            let closestBlock
            let closestDistance = -1
            varBlocks.forEach(blockId=>{
                let block = vm.editingTarget.blocks.getBlock(blockId)
                if(!block.parent) {
                    let distance = getDistance({x:block.x,y:block.y},oldCoordinate)
                    if(!closestBlock || distance < closestDistance) {
                        closestBlock = block
                        closestDistance = distance
                    }
                }
            })
            if(!closestBlock) {console.log('bruh')}
            else {
                vEvent.blockId = closestBlock.id;
                bEvent.blockId = closestBlock.id;
                if(d.type == 'delete') {
                    bEvent.ids = [closestBlock.id];
                    vEvent.ids = [closestBlock.id];
                }
            }
        }
    }

    //find true field
    if(!!d.extrargs.fieldTag) {
        let realId = vm.editingTarget.blocks.getBlock(d.extrargs.parentId).inputs[d.extrargs.fieldTag].shadow
        vEvent.blockId = realId;
        bEvent.blockId = realId;
    }
    //xml
    if(!!d.extrargs.xml) {
        vEvent.xml = d.extrargs.xml
    }

    // add comment create xy
    if(d.type == "comment_create") {
        bEvent.xy = d.event.xy
    }

    if(oldEditingTarget.sprite.name == d.target) {
        // save speedy move and delete events for later
        if((bEvent.type == 'move' || bEvent.type == 'delete') && bEvent.blockId in toBeMoved) {toBeMoved[bEvent.blockId].push(d)}
        else{
        //inject directly into blockly
        if(!isBadToRunBlockly(bEvent,getWorkspace()) && !isBadToRun(bEvent,vm.editingTarget)) {
            // record newly made block so that we can intercept it's blockly auto-generated move event later
            // ...dont record it for newly created custom block definitions
            if(bEvent.type == 'create' && !d.extrargs.isCBCreateOrDelete){toBeMoved[bEvent.blockId] = []} 
            // record played blocklive event
            blockliveEvents[getStringEventRep(bEvent)] = true
            // run event
            bEvent.run(true)
            lastEventRun = bEvent 

            // for custom blocks, update toolbox
            if(bEvent.element == "mutation" || d.extrargs.isCBCreateOrDelete) {
                getWorkspace().getToolbox().refreshSelection()
            }
        }
    }
    } else {
        if(!isBadToRun(vEvent,vm.editingTarget)) {
            vm.editingTarget.blocks.blocklyListen(vEvent)
        }
    }

    //reset editing target
    vm.editingTarget = oldEditingTarget
    vm.runtime._editingTarget = oldEditingTarget
}

let oldEWU = (vm.emitWorkspaceUpdate).bind(vm)
vm.emitWorkspaceUpdate = function() {
    console.log("WORKSPACE UPDATING")
    // add deletes for comments
    getWorkspace().getTopComments().forEach(comment=>{
        blockliveEvents[getStringEventRep({type:'comment_delete',commentId:comment.id})] = true
    })
    // add creates for comments in new workspace
    Object.keys(vm.editingTarget.comments).forEach(commentId=>{
        blockliveEvents[getStringEventRep({type:'comment_create',commentId})] = true
    })
    // add deletes for top blocks in current workspace
    getWorkspace().topBlocks_.forEach(block=>{
        blockliveEvents[getStringEventRep({type:'delete',blockId:block.id})] = true
    })
    // add creates for all blocks in new workspace
    Object.keys(vm.editingTarget.blocks._blocks).forEach(blockId=>{
        blockliveEvents[getStringEventRep({type:'create',blockId})] = true
    })
    // add var creates and deletes
    Object.entries(vm.editingTarget.variables).forEach(varr=>{
        blockliveEvents[getStringEventRep({type:'var_delete',varId:varr[0],isCloud:varr[1].isCloud,varName:varr[1].name,isLocal:false})] = true
        blockliveEvents[getStringEventRep({type:'var_create',varId:varr[0],isCloud:varr[1].isCloud,varName:varr[1].name,isLocal:true})] = true
    })
    // add global (local:false) var creates
    Object.entries(vm.runtime.getTargetForStage().variables).forEach(varr=>{
        // blockliveEvents[getStringEventRep({type:'var_delete',varId:varr[0],isCloud:varr[1].isCloud,varName:varr[1].name,isLocal:false})] = true
        blockliveEvents[getStringEventRep({type:'var_create',varId:varr[0],isCloud:varr[1].isCloud,varName:varr[1].name,isLocal:false})] = true
    })
    oldEWU()
}

// vm.editingTarget = a;
// vm.emitTargetsUpdate(false /* Don't emit project change */);
// vm.emitWorkspaceUpdate();
// vm.blockListener = proxy(vm.blockListener,"blocks",
//     (args)=>({type:args[0].type}),
//     (data)=>[{...data.args[0],type:data.extrargs.type}]
// )
// vm.blockListener = stProxy(vm.blockListener,"blocklist",null,null,null,()=>{vm.emitWorkspaceUpdate()})


// TODO: eventually maybe sync this
// vm.runtime.requestShowMonitor = anyproxy(vm.runtime,vm.runtime.requestShowMonitor,"showmonitor")
// vm.runtime.requestHideMonitor = anyproxy(vm.runtime,vm.runtime.requestHideMonitor,"showmonitor")

function targetToName(target) {
    return target.sprite.name
}
function nameToTarget(name) {
    return vm.runtime.getSpriteTargetByName(name)
}

vm.renameCostume = editingProxy(vm.renameCostume,"renamecostume")
vm.duplicateCostume = editingProxy(vm.duplicateCostume,"dupecostume")
vm.deleteCostume = editingProxy(vm.deleteCostume,"deletecostume")
vm.reorderCostume = proxy(vm.reorderCostume,"reordercostume",
    (args)=>({target:targetToName(vm.runtime.getTargetById(args[0]))}),
    (data)=>[nameToTarget(data.extrargs.target).id,data.args[1],data.args[2]],null,
    ()=>{vm.emitTargetsUpdate()})
vm.addCostume = proxy(vm.addCostume,"addcostume",
    (args)=>{
        let targetName
        if(!!args[2]){targetName = vm.runtime.getTargetById(args[2]).sprite.name} else {targetName = vm.editingTarget.sprite.name}
        return {target:targetName}
    },
    (data)=>{
        let ret = [data.args[0],data.args[1],vm.runtime.getSpriteTargetByName(data.extrargs.target).id,data.args[3]]
        if(ret[1]?.asset?.data) {
            // adapted from scratch source 'file-uploader'
            ret[1].asset = vm.runtime.storage.createAsset(
                ret[1].asset.assetType, 
                ret[1].asset.dataFormat,
                Uint8Array.from(Object.values(ret[1].asset.data)),null,true);
            ret[1] = {
                name: null,
                dataFormat: ret[1].asset.dataFormat,
                asset: ret[1].asset,
                md5: `${ret[1].asset.assetId}.${ret[1].asset.dataFormat}`,
                assetId: ret[1].asset.assetId
            };
        }
        return ret
    }
)
// vm.updateBitmap = editingProxy(vm.updateBitmap,"updatebitmap",
//     (args)=>({h:args[1].height,w:args[1].width}),
//     (data)=>{
//         let args = data.args;
//         args[1] = new ImageData(Uint8ClampedArray.from(Object.values(args[1].data)), data.extrargs.width, data.extrargs.height);
//         return args
//     })
vm.updateSvg = editingProxy(vm.updateSvg,"updatesvg")
// vm.updateBitmap = proxy(vm.updateBitmap,"updatebit",null,null,null,()=>{vm.emitTargetsUpdate();vm.emitWorkspaceUpdate()})
// vm.updateSvg = proxy(vm.updateSvg,"updatesvg",null,null,null,()=>{vm.emitTargetsUpdate();vm.emitWorkspaceUpdate()})
vm.addSprite = proxy(vm.addSprite,"addsprite",null,null,null,((a,b)=>{vm.setEditingTarget(a.id)}))
vm.deleteSprite = proxy(vm.deleteSprite,"deletesprite",
    (args)=>({name:vm.runtime.getTargetById(args[0]).sprite.name}),
    (data)=>[vm.runtime.getSpriteTargetByName(data.extrargs.name).id])
vm.renameSprite = proxy(vm.renameSprite,"renamesprite",
    (args)=>({oldName:vm.runtime.getTargetById(args[0]).sprite.name}),
    (data)=>[vm.runtime.getSpriteTargetByName(data.extrargs.oldName).id,data.args[1]])
vm.reorderTarget = proxy(vm.reorderTarget,"reordertarget")
// vm.shareBlocksToTarget = proxy(vm.shareBlocksToTarget,"shareblocks",
// (args)=>({toName:vm.runtime.getTargetById(args[1]).sprite.name}),
// (data)=>[data.args[0],vm.runtime.getSpriteTargetByName(data.extrargs.toName).id],null,()=>{vm.emitWorkspaceUpdate()})

let shareCreates = []
let lastDeletedBlock
getObj(()=>(vm.editingTarget)).then(()=>{
    let oldCreateBlock = vm.editingTarget.blocks.__proto__.createBlock

    vm.editingTarget.blocks.__proto__.createBlock = function(...args) {
        if(isTargetSharing) {
            shareCreates.push(args)
        }
        return oldCreateBlock.call(this,...args)
    }

    let oldDeleteBlock = vm.editingTarget.blocks.__proto__.deleteBlock
    vm.editingTarget.blocks.__proto__.deleteBlock = function(...args) {
        lastDeletedBlock = this._blocks[args[0]]
        return oldDeleteBlock.call(this,...args)
    }
})

getObj(()=>(vm.extensionManager)).then(()=>{
    vm.extensionManager.loadExtensionURL = 
    anyproxy(vm.extensionManager,vm.extensionManager.loadExtensionURL,"loadextensionurl")
})


let oldShareBlocksToTarget = vm.shareBlocksToTarget
let isTargetSharing = false
vm.shareBlocksToTarget = function(blocks, targetId, optFromTargetId) {
    shareCreates = []
    isTargetSharing = true
    return oldShareBlocksToTarget.bind(vm)(blocks, targetId, optFromTargetId).then(()=>{
        isTargetSharing = false
        let targetName = vm.runtime.getTargetById(targetId).sprite.name
        let fromTargetName = vm.runtime.getTargetById(optFromTargetId)?.sprite.name
        liveMessage({meta:"vm.shareBlocks",target:targetName,from:fromTargetName,blocks:shareCreates})
    })
}

function doShareBlocksMessage(msg) {
    let target = vm.runtime.getSpriteTargetByName(msg.target)
    let targetId = target.id
    let fromTargetId = vm.runtime.getSpriteTargetByName(msg.from)?.id
    // resolve variable conflicts
    // if(!!fromTargetId) {vm.runtime.getTargetById(fromTargetId).resolveVariableSharingConflictsWithTarget(msg.blocks, target);}

    // create new blocks in target
    msg.blocks.forEach(bargs=>{target.blocks.createBlock(...bargs)})
    target.blocks.updateTargetSpecificBlocks(target.isStage);

    if(targetId == vm.editingTarget.id) {vm.emitWorkspaceUpdate()}
    // update flyout for new variables and blocks
    getWorkspace().getToolbox().refreshSelection()
}


// vm.shareCostumeToTarget

// no sure what this does but it might be useful at some point this.editingTarget.fixUpVariableReferences();

// port.postMessage();


///.......... CHROME PORT LISTENER SETUP ..........//

function connectFirstTime() {
    reconnectIfNeeded()
    // request for blockliveId
    liveMessage({meta:"hiimhungry"})
}
connectFirstTime()

setInterval(reconnectIfNeeded,1000)