import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = { apiKey:"AIzaSyBuER6gwaNw4om3OCHkwK7nIETeroG-vIs", authDomain:"at-map-tmc.firebaseapp.com", projectId:"at-map-tmc", storageBucket:"at-map-tmc.firebasestorage.app", messagingSenderId:"862190385314", appId:"1:862190385314:web:f7fbf6a9eed1061231fffb" };
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app), storage = getStorage(app);
const provider = new GoogleAuthProvider();
const params = new URLSearchParams(location.search);
const shareToken = params.get("share");
const readOnly = Boolean(shareToken);
const map = L.map("journal-map").setView([39.2,-76.7],5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"&copy; OpenStreetMap contributors" }).addTo(map);
const journalLayer = L.layerGroup().addTo(map);
const pinIcon = L.divIcon({ className:`journal-pin${readOnly ? " shared" : ""}`, iconSize:[26,26], iconAnchor:[13,26] });
const $ = (id) => document.getElementById(id);
let user = null, entries = [], draftMarker = null, group = null, members = [];

function escapeHtml(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function dateValue(date=new Date()) { const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60000); return shifted.toISOString().slice(0,16); }
function asDate(value) { return value?.toDate ? value.toDate() : new Date(value); }
function setStatus(text) { $("status").textContent=text; $("status").hidden=!text; }
function randomToken() { const bytes=crypto.getRandomValues(new Uint8Array(24)); return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""); }
function serializeEntry(entry) { return { id:entry.id, title:entry.title, body:entry.body, lat:entry.lat, lng:entry.lng, occurredAt:asDate(entry.occurredAt).toISOString(), photoUrls:entry.photoUrls || [] }; }

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
function waitForAuth() { return new Promise(resolve=>{ const off=onAuthStateChanged(auth,u=>{off(); resolve(u);}); }); }
async function requireUser() { user=await waitForAuth(); if(!user){ try{await signInWithPopup(auth,provider); user=auth.currentUser;}catch{ location.href="index.html"; } } return user; }

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

async function uploadPhotos(files,entryId) {
  return Promise.all(Array.from(files).map(async(file,index)=>{ if(!file.type.startsWith("image/")) throw new Error("Only image files can be attached."); if(file.size>10*1024*1024) throw new Error("Each picture must be smaller than 10 MB."); const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"); const target=ref(storage,`journalPhotos/${user.uid}/${entryId}/${Date.now()}-${index}-${safe}`); await uploadBytes(target,file,{contentType:file.type}); return getDownloadURL(target); }));
}
async function saveEntry() {
  const lat=Number($("entry-lat").value),lng=Number($("entry-lng").value),title=$("entry-title").value.trim(),body=$("entry-body").value.trim(),when=new Date($("entry-date").value);
  if(!title||!body||!Number.isFinite(lat)||!Number.isFinite(lng)||Number.isNaN(when.getTime())) { $("entry-error").textContent="Add a title, journal entry, date, and valid pin location."; return; }
  const button=$("save-entry-btn"); button.disabled=true; $("entry-error").textContent="";
  try { const id=$("entry-id").value; const existing=entries.find(e=>e.id===id); const entryRef=id?doc(db,"users",user.uid,"journalEntries",id):doc(collection(db,"users",user.uid,"journalEntries"));
    const photoUrls=[...(existing?.photoUrls||[]),...await uploadPhotos($("entry-photos").files,entryRef.id)];
    const payload={title,body,lat,lng,occurredAt:Timestamp.fromDate(when),photoUrls,ownerUid:user.uid,updatedAt:serverTimestamp()};
    if(id) await updateDoc(entryRef,payload); else await setDoc(entryRef,{...payload,createdAt:serverTimestamp()});
    $("entry-dialog").close(); await loadPrivateEntries(); await syncSharedJournal();
  } catch(e) { console.error(e); $("entry-error").textContent=e.message||"Could not save this entry."; } finally { button.disabled=false; }
}
$("save-entry-btn").addEventListener("click",saveEntry);
$("delete-entry-btn").addEventListener("click",async()=>{ const id=$("entry-id").value; if(!id||!confirm("Delete this journal entry?"))return; await deleteDoc(doc(db,"users",user.uid,"journalEntries",id)); $("entry-dialog").close(); await loadPrivateEntries(); await syncSharedJournal(); });

async function loadGroup() { const snap=await getDoc(doc(db,"users",user.uid,"journalGroups","default")); group=snap.exists()?snap.data():null; members=group?.memberEmails||[]; }
function renderMembers(){ $("member-list").innerHTML=members.map((email,i)=>`<div class="member-chip"><span>${escapeHtml(email)}</span><button type="button" data-remove="${i}" aria-label="Remove ${escapeHtml(email)}">Remove</button></div>`).join(""); }
function shareUrl(){return group?.shareToken?`${location.origin}${location.pathname}?share=${encodeURIComponent(group.shareToken)}`:"Save the group to create a link";}
$("manage-group-btn").addEventListener("click",async()=>{await loadGroup(); $("group-name").value=group?.name||"Trail family & friends"; renderMembers(); $("share-link").value=shareUrl(); $("group-error").textContent=""; $("group-dialog").showModal();});
$("add-member-btn").addEventListener("click",()=>{const email=$("member-email").value.trim().toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){$("group-error").textContent="Enter a valid email address.";return;} if(!members.includes(email))members.push(email); $("member-email").value=""; $("group-error").textContent=""; renderMembers();});
$("member-list").addEventListener("click",e=>{const button=e.target.closest("[data-remove]");if(button){members.splice(Number(button.dataset.remove),1);renderMembers();}});
$("copy-link-btn").addEventListener("click",async()=>{if(group?.shareToken){await navigator.clipboard.writeText(shareUrl());$("copy-link-btn").textContent="Copied";setTimeout(()=>$("copy-link-btn").textContent="Copy",1500);}});
async function syncSharedJournal() { if(!group?.shareToken)return; await setDoc(doc(db,"sharedJournals",group.shareToken),{ownerUid:user.uid,groupName:group.name,entries:entries.map(serializeEntry),updatedAt:serverTimestamp()}); }
$("save-group-btn").addEventListener("click",async()=>{const button=$("save-group-btn");button.disabled=true;try{const token=group?.shareToken||randomToken();group={name:$("group-name").value.trim()||"Shared trail journal",memberEmails:[...members],shareToken:token};await setDoc(doc(db,"users",user.uid,"journalGroups","default"),{...group,ownerUid:user.uid,updatedAt:serverTimestamp()},{merge:true});await syncSharedJournal();$("share-link").value=shareUrl();}catch(e){console.error(e);$("group-error").textContent=e.message||"Could not save this group.";}finally{button.disabled=false;}});

(async()=>{try{if(readOnly)await loadSharedEntries();else{await requireUser();if(!user)return;await loadPrivateEntries();}}catch(e){console.error(e);setStatus(e.message||"Unable to load this journal.");}})();

