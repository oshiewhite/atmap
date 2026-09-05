import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, reauthenticateWithPopup, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = { apiKey:"AIzaSyBuER6gwaNw4om3OCHkwK7nIETeroG-vIs", authDomain:"at-map-tmc.firebaseapp.com", projectId:"at-map-tmc", storageBucket:"at-map-tmc.firebasestorage.app", messagingSenderId:"862190385314", appId:"1:862190385314:web:f7fbf6a9eed1061231fffb" };
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app);
const authPersistenceReady = (async () => {
  if (typeof auth.authStateReady === "function") await auth.authStateReady();
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (localError) {
    console.warn("Local auth persistence unavailable; using this browser session:", localError);
    await setPersistence(auth, browserSessionPersistence);
  }
})();
const provider = new GoogleAuthProvider();
const driveProvider = new GoogleAuthProvider();
driveProvider.addScope("https://www.googleapis.com/auth/drive.file");
const params = new URLSearchParams(location.search);
const shareToken = params.get("share");
const readOnly = Boolean(shareToken);
const map = L.map("journal-map").setView([39.2,-76.7],5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"&copy; OpenStreetMap contributors" }).addTo(map);
const journalLayer = L.layerGroup().addTo(map);
const trailLayer = L.layerGroup().addTo(map);
const mileLayer = L.layerGroup().addTo(map);
const pinIcon = L.divIcon({ className:`journal-pin${readOnly ? " shared" : ""}`, iconSize:[26,26], iconAnchor:[13,26] });
const $ = (id) => document.getElementById(id);
let user = null, entries = [], draftMarker = null, group = null, members = [];

function escapeHtml(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function dateValue(date=new Date()) { const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60000); return shifted.toISOString().slice(0,16); }
function asDate(value) { return value?.toDate ? value.toDate() : new Date(value); }
function setStatus(text) { $("status").textContent=text; $("status").hidden=!text; }
function randomToken() { const bytes=crypto.getRandomValues(new Uint8Array(24)); return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""); }
function serializeEntry(entry) { return { id:entry.id, title:entry.title, body:entry.body, lat:entry.lat, lng:entry.lng, occurredAt:asDate(entry.occurredAt).toISOString(), photoUrls:entry.photoUrls || [] }; }

let mileMarkers = [];
function renderMileMarkers() {
  mileLayer.clearLayers();
  const zoom=map.getZoom();
  let step=250;
  if(zoom>=13) step=1;
  else if(zoom>=10) step=5;
  else if(zoom>=8) step=25;
  else if(zoom>=7) step=50;
  else if(zoom>=6) step=100;
  const bounds=map.getBounds();
  mileMarkers.forEach(point=>{
    if(point.mile%step!==0 || !bounds.contains([point.lat,point.lng])) return;
    const icon=L.divIcon({className:"mile-marker-label",html:`<span>${point.mile}</span>`,iconSize:[34,20],iconAnchor:[17,10]});
    L.marker([point.lat,point.lng],{icon,interactive:false}).addTo(mileLayer);
  });
}
async function loadTrailContext() {
  try {
    const [trailResponse,milesResponse]=await Promise.all([fetch("data/at.geojson"),fetch("data/mile_markers.csv")]);
    if(!trailResponse.ok||!milesResponse.ok) throw new Error("Trail data could not be loaded.");
    const trail=L.geoJSON(await trailResponse.json(),{style:{color:"#486ee0",weight:4,opacity:.9}}).addTo(trailLayer);
    const rows=(await milesResponse.text()).trim().split(/\r?\n/).slice(1);
    mileMarkers=rows.map(row=>{const [lat,lng,,mile]=row.split(",");return {lat:Number(lat),lng:Number(lng),mile:Number(mile)};}).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Number.isFinite(p.mile));
    renderMileMarkers();
    if(!entries.length&&trail.getBounds().isValid()) map.fitBounds(trail.getBounds(),{padding:[20,20]});
  } catch(error) {
    console.error("Unable to load trail context:",error);
  }
}
map.on("zoomend moveend",renderMileMarkers);

function popupHtml(entry) {
  const photos=(entry.photoUrls||[]).map(url=>`<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="Journal attachment"></a>`).join("");
  return `<h3>${escapeHtml(entry.title)}</h3><time>${asDate(entry.occurredAt).toLocaleString()}</time><p>${escapeHtml(entry.body).replace(/\n/g,"<br>")}</p>${photos?`<div class="popup-photos">${photos}</div>`:""}`;
}
function renderEntries() {
  journalLayer.clearLayers(); $("entry-list").innerHTML=""; $("entry-count").textContent=String(entries.length);
  const bounds=[];
  entries.sort((a,b)=>asDate(b.occurredAt)-asDate(a.occurredAt)).forEach(entry=>{
    const marker=L.marker([entry.lat,entry.lng],{icon:pinIcon}).addTo(journalLayer).bindPopup(popupHtml(entry),{maxWidth:330});
    marker.on("click",()=>selectEntry(entry,false)); bounds.push([entry.lat,entry.lng]);
    const card=document.createElement("button"); card.type="button"; card.className="entry-card";
    card.innerHTML=`<h3>${escapeHtml(entry.title)}</h3><time>${asDate(entry.occurredAt).toLocaleString()}</time><p>${escapeHtml(entry.body)}</p>`;
    card.addEventListener("click",()=>{ map.setView([entry.lat,entry.lng],15); marker.openPopup(); }); $("entry-list").appendChild(card);
  });
  setStatus(entries.length ? "" : "No journal entries yet.");
  if(bounds.length) map.fitBounds(bounds,{padding:[40,40],maxZoom:14});
}

async function loadPrivateEntries() {
  const snapshot=await getDocs(query(collection(db,"users",user.uid,"journalEntries"),orderBy("occurredAt","desc")));
  entries=snapshot.docs.map(s=>({id:s.id,...s.data()})); renderEntries(); await loadGroup();
}
async function loadSharedEntries() {
  document.body.classList.add("readonly"); $("page-title").textContent="Shared trail journal"; $("page-subtitle").textContent="Read-only journal shared with you.";
  const snap=await getDoc(doc(db,"sharedJournals",shareToken));
  if(!snap.exists()) throw new Error("This share link is invalid or has been removed.");
  const data=snap.data(); entries=Array.isArray(data.entries)?data.entries:[]; $("page-title").textContent=data.groupName || "Shared trail journal"; renderEntries();
}
async function waitForAuth() {
  await authPersistenceReady;
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
    return auth.currentUser;
  }
  return new Promise(resolve=>{ let off=()=>{}; off=onAuthStateChanged(auth,u=>{off(); resolve(u);}); });
}
async function requireUser() {
  user=await waitForAuth();
  if(!user) {
    $("journal-signin-btn").hidden=false;
    $("new-entry-btn").hidden=true;
    $("manage-group-btn").hidden=true;
    setStatus("Sign in with Google to open your private journal.");
  }
  return user;
}

$("journal-signin-btn").addEventListener("click",async()=>{
  const button=$("journal-signin-btn");
  button.disabled=true;
  setStatus("Signing you in…");
  try {
    await signInWithPopup(auth,provider);
    user=auth.currentUser;
    if(!user) throw new Error("Google sign-in did not complete.");
    button.hidden=true;
    $("new-entry-btn").hidden=false;
    $("manage-group-btn").hidden=false;
    await loadPrivateEntries();
  } catch(e) {
    console.error(e);
    setStatus(e?.code==="auth/popup-closed-by-user" ? "Sign-in was cancelled. You are still on My Journal." : "Sign-in failed. Please try again.");
  } finally {
    button.disabled=false;
  }
});

function positionDraft(lat,lng) {
  if(draftMarker) map.removeLayer(draftMarker);
  draftMarker=L.marker([lat,lng],{draggable:true,icon:pinIcon}).addTo(map);
  const sync=()=>{const p=draftMarker.getLatLng(); $("entry-lat").value=p.lat.toFixed(6); $("entry-lng").value=p.lng.toFixed(6);};
  draftMarker.on("dragend",sync); sync(); map.setView([lat,lng],15);
}
function selectEntry(entry,open=true) {
  if(readOnly) return;
  $("entry-dialog-title").textContent=entry?"Edit journal pin":"New journal pin"; $("entry-id").value=entry?.id||"";
  $("entry-title").value=entry?.title||""; $("entry-body").value=entry?.body||""; $("entry-date").value=dateValue(entry?asDate(entry.occurredAt):new Date());
  $("entry-lat").value=entry?.lat??""; $("entry-lng").value=entry?.lng??""; $("entry-photos").value=""; $("entry-error").textContent="";
  $("delete-entry-btn").hidden=!entry; $("existing-photos").innerHTML=(entry?.photoUrls||[]).map(url=>`<img src="${escapeHtml(url)}" alt="Existing journal attachment">`).join("");
  if(entry) positionDraft(entry.lat,entry.lng); else if(draftMarker){map.removeLayer(draftMarker);draftMarker=null;}
  if(open) $("entry-dialog").showModal();
}

$("new-entry-btn").addEventListener("click",()=>selectEntry(null));
$("use-location-btn").addEventListener("click",()=>navigator.geolocation?.getCurrentPosition(p=>positionDraft(p.coords.latitude,p.coords.longitude),e=>$("entry-error").textContent=e.message,{enableHighAccuracy:true,timeout:12000}));
$("place-pin-btn").addEventListener("click",()=>{ $("entry-dialog").close(); setStatus("Click the map to place your journal pin."); map.once("click",e=>{positionDraft(e.latlng.lat,e.latlng.lng); setStatus(""); $("entry-dialog").showModal();}); });
[$("entry-lat"),$("entry-lng")].forEach(el=>el.addEventListener("change",()=>{const lat=Number($("entry-lat").value),lng=Number($("entry-lng").value); if(Number.isFinite(lat)&&Number.isFinite(lng))positionDraft(lat,lng);}));
$("entry-dialog").addEventListener("close",()=>{if(draftMarker){map.removeLayer(draftMarker);draftMarker=null;}});

async function prepareImage(file) {
  if(!file.type.startsWith("image/")) throw new Error("Only image files can be attached.");
  if(file.size>25*1024*1024) throw new Error("Each original picture must be smaller than 25 MB.");
  if(file.size<=2*1024*1024) return file;
  try {
    const bitmap=await createImageBitmap(file);
    const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Unable to resize this picture.")),"image/jpeg",.82));
    return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"});
  } catch(error) {
    if(file.size>10*1024*1024) throw new Error("This picture could not be resized. Choose a smaller image.");
    console.warn("Image resize unavailable; uploading the original:",error);
    return file;
  }
}
let driveAccessToken="";
function confirmDriveConnection() {
  const dialog=$("drive-connect-dialog");
  const connectButton=$("drive-connect-btn");
  const errorElement=$("drive-connect-error");
  dialog.returnValue="";
  errorElement.textContent="";
  dialog.showModal();
  return new Promise(resolve=>{
    let authorizing=false;
    const finish=()=>{
      connectButton.removeEventListener("click",connect);
      resolve(dialog.returnValue==="connect" && Boolean(driveAccessToken));
    };
    const connect=async()=>{
      if(authorizing) return;
      authorizing=true;
      connectButton.disabled=true;
      connectButton.textContent="Connecting…";
      errorElement.textContent="";
      try {
        await getDriveAccessToken();
        dialog.close("connect");
      } catch(error) {
        console.error("Google Drive authorization failed:",error);
        errorElement.textContent=error?.code==="auth/popup-blocked"
          ? "Your browser blocked the Google window. Allow pop-ups for ATMap and tap Connect Google Drive again."
          : error?.code==="auth/popup-closed-by-user"
            ? "Google Drive was not connected. Tap Connect Google Drive when you are ready."
            : error.message||"Google Drive could not be connected. Please try again.";
      } finally {
        authorizing=false;
        connectButton.disabled=false;
        connectButton.textContent="Connect Google Drive";
      }
    };
    connectButton.addEventListener("click",connect);
    dialog.addEventListener("close",finish,{once:true});
  });
}
async function getDriveAccessToken() {
  if(driveAccessToken) return driveAccessToken;
  const result=await reauthenticateWithPopup(user,driveProvider);
  const credential=GoogleAuthProvider.credentialFromResult(result);
  if(!credential?.accessToken) throw new Error("Google Drive permission was not granted.");
  driveAccessToken=credential.accessToken;
  return driveAccessToken;
}
async function driveRequest(url,options={}) {
  const token=await getDriveAccessToken();
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}});
  if(!response.ok) {
    let detail=""; try{detail=(await response.json())?.error?.message||"";}catch{}
    if(response.status===401){driveAccessToken="";throw new Error("Google Drive authorization expired. Please try the upload again.");}
    if(response.status===403) throw new Error(detail||"Google Drive blocked the upload. Enable the Google Drive API for this Firebase project.");
    throw new Error(detail||`Google Drive upload failed (${response.status}).`);
  }
  return response;
}
async function getJournalDriveFolder() {
  const cached=localStorage.getItem(`atmap-drive-folder-${user.uid}`);
  if(cached) return cached;
  const q=encodeURIComponent("name = 'AT Map Journal' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const found=await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  const files=(await found.json()).files||[];
  if(files[0]?.id){localStorage.setItem(`atmap-drive-folder-${user.uid}`,files[0].id);return files[0].id;}
  const created=await driveRequest("https://www.googleapis.com/drive/v3/files?fields=id",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"AT Map Journal",mimeType:"application/vnd.google-apps.folder",appProperties:{createdBy:"atmap-journal"}})});
  const id=(await created.json()).id; localStorage.setItem(`atmap-drive-folder-${user.uid}`,id); return id;
}
async function uploadPhotoToDrive(file,folderId) {
  const metadata=await driveRequest("https://www.googleapis.com/drive/v3/files?fields=id",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,parents:[folderId],appProperties:{createdBy:"atmap-journal"}})});
  const fileId=(await metadata.json()).id;
  await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,{method:"PATCH",headers:{"Content-Type":file.type},body:file});
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"anyone",role:"reader",allowFileDiscovery:false})});
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
}
async function uploadPhotos(files,entryId,onProgress) {
  const urls=[]; const list=Array.from(files);
  if(!list.length) return urls;
  if(!driveAccessToken && !await confirmDriveConnection()) return null;
  onProgress(0,list.length,0);
  const folderId=await getJournalDriveFolder();
  for(let index=0;index<list.length;index++) {
    const file=await prepareImage(list[index]);
    onProgress(index+1,list.length,25);
    urls.push(await uploadPhotoToDrive(file,folderId));
    onProgress(index+1,list.length,100);
  }
  return urls;
}
async function saveEntry() {
  const lat=Number($("entry-lat").value),lng=Number($("entry-lng").value),title=$("entry-title").value.trim(),body=$("entry-body").value.trim(),when=new Date($("entry-date").value);
  if(!title||!body||!Number.isFinite(lat)||!Number.isFinite(lng)||Number.isNaN(when.getTime())) { $("entry-error").textContent="Add a title, journal entry, date, and valid pin location."; return; }
  if(!user) { $("entry-error").textContent="Your session is unavailable. Return to My Account and try again."; return; }
  const button=$("save-entry-btn"); const originalText=button.textContent; button.disabled=true; button.textContent="Saving…"; $("entry-error").textContent="";
  try { const id=$("entry-id").value; const existing=entries.find(e=>e.id===id); const entryRef=id?doc(db,"users",user.uid,"journalEntries",id):doc(collection(db,"users",user.uid,"journalEntries"));
    const uploadedPhotoUrls=await uploadPhotos($("entry-photos").files,entryRef.id,(current,total,percent)=>{button.textContent=`Uploading ${current}/${total} · ${percent}%`;});
    if(uploadedPhotoUrls===null) return;
    const photoUrls=[...(existing?.photoUrls||[]),...uploadedPhotoUrls];
    const payload={title,body,lat,lng,occurredAt:Timestamp.fromDate(when),photoUrls,ownerUid:user.uid,updatedAt:serverTimestamp()};
    if(id) await updateDoc(entryRef,payload); else await setDoc(entryRef,{...payload,createdAt:serverTimestamp()});
    $("entry-dialog").close(); await loadPrivateEntries(); await syncSharedJournal();
  } catch(e) {
    console.error(e);
    const message=e?.code==="permission-denied"
      ? "Firebase blocked this save. Publish the new Firestore rules, then try again."
      : e.message||"Could not save this entry.";
    $("entry-error").textContent=message;
    $("entry-error").scrollIntoView({behavior:"smooth",block:"center"});
    alert(message);
  } finally { button.disabled=false; button.textContent=originalText; }
}
$("save-entry-btn").addEventListener("click",saveEntry);
$("delete-entry-btn").addEventListener("click",async()=>{ const id=$("entry-id").value; if(!id||!confirm("Delete this journal entry?"))return; await deleteDoc(doc(db,"users",user.uid,"journalEntries",id)); $("entry-dialog").close(); await loadPrivateEntries(); await syncSharedJournal(); });

async function loadGroup() { const snap=await getDoc(doc(db,"users",user.uid,"journalGroups","default")); group=snap.exists()?snap.data():null; members=group?.memberEmails||[]; }
function renderMembers(){ $("member-list").innerHTML=members.map((email,i)=>`<div class="member-chip"><span>${escapeHtml(email)}</span><button type="button" data-remove="${i}" aria-label="Remove ${escapeHtml(email)}">Remove</button></div>`).join(""); }
function shareUrl(){return group?.shareToken?`${new URL("journal.html",location.href).href.split("?")[0]}?share=${encodeURIComponent(group.shareToken)}`:"Save the group to create a link";}
$("manage-group-btn").addEventListener("click",async()=>{await loadGroup(); $("group-name").value=group?.name||"Trail family & friends"; renderMembers(); $("share-link").value=shareUrl(); $("group-error").textContent=""; $("group-dialog").showModal();});
$("add-member-btn").addEventListener("click",()=>{const email=$("member-email").value.trim().toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){$("group-error").textContent="Enter a valid email address.";return;} if(!members.includes(email))members.push(email); $("member-email").value=""; $("group-error").textContent=""; renderMembers();});
$("member-list").addEventListener("click",e=>{const button=e.target.closest("[data-remove]");if(button){members.splice(Number(button.dataset.remove),1);renderMembers();}});
$("copy-link-btn").addEventListener("click",async()=>{if(group?.shareToken){await navigator.clipboard.writeText(shareUrl());$("copy-link-btn").textContent="Copied";setTimeout(()=>$("copy-link-btn").textContent="Copy",1500);}});
async function syncSharedJournal() { if(!group?.shareToken)return; await setDoc(doc(db,"sharedJournals",group.shareToken),{ownerUid:user.uid,groupName:group.name,entries:entries.map(serializeEntry),updatedAt:serverTimestamp()}); }
$("save-group-btn").addEventListener("click",async()=>{const button=$("save-group-btn");button.disabled=true;try{const token=group?.shareToken||randomToken();group={name:$("group-name").value.trim()||"Shared trail journal",memberEmails:[...members],shareToken:token};await setDoc(doc(db,"users",user.uid,"journalGroups","default"),{...group,ownerUid:user.uid,updatedAt:serverTimestamp()},{merge:true});await syncSharedJournal();$("share-link").value=shareUrl();}catch(e){console.error(e);$("group-error").textContent=e.message||"Could not save this group.";}finally{button.disabled=false;}});

(async()=>{loadTrailContext();try{if(readOnly)await loadSharedEntries();else{await requireUser();if(!user)return;await loadPrivateEntries();}}catch(e){console.error(e);setStatus(e.message||"Unable to load this journal.");}})();

