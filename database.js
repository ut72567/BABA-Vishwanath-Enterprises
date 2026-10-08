
import { db, auth } from './firebase.js';  
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";  
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";  
import { functions } from './firebase.js';  
  
// Public CMS Reads  
export const getSiteSettings = async () => {  
    const snap = await getDoc(doc(db, "siteSettings", "main"));  
    return snap.exists() ? snap.data() : null;  
};  
export const getSliders = async () => {  
    const snap = await getDocs(query(collection(db, "sliders"), orderBy("displayOrder")));  
    return snap.docs.map(d => ({id: d.id, ...d.data()}));  
};  
export const getCategories = async () => {  
    const snap = await getDocs(query(collection(db, "categories"), orderBy("displayOrder")));  
    return snap.docs.map(d => ({id: d.id, ...d.data()}));  
};  
export const getMaterials = async () => {  
    const snap = await getDocs(collection(db, "materials"));  
    return snap.docs.map(d => ({id: d.id, ...d.data()}));  
};  
export const getProducts = async (filters = {}) => {  
    let q = collection(db, "products");  
    const constraints = [];  
    if(filters.category) constraints.push(where("category", "==", filters.category));  
    if(filters.isLatest) constraints.push(where("isLatest", "==", true));  
      
    const snap = await getDocs(query(q, ...constraints));  
    return snap.docs.map(d => ({id: d.id, ...d.data()}));  
};  
export const getProductBySlug = async (slug) => {
    if (!slug) return null;
    const snap = await getDocs(query(collection(db, "products"), where("slug", "==", slug)));
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };

    try {
        const direct = await getDoc(doc(db, "products", slug));
        return direct.exists() ? { id: direct.id, ...direct.data() } : null;
    } catch (_) {
        return null;
    }
};

export const getAboutContent = async () => {  
    const snap = await getDoc(doc(db, "aboutContent", "main"));  
    return snap.exists() ? snap.data() : null;  
};  
  
// Protected Order/Enquiry Writes (Via Cloud Functions)  
export const submitB2BOrder = async (orderPayload) => {  
    const fn = httpsCallable(functions, 'createB2BOrder');  
    return await fn(orderPayload);  
};  
export const submitEnquiry = async (enquiryPayload) => {  
    const fn = httpsCallable(functions, 'submitEnquiry');  
    return await fn(enquiryPayload);  
};  
  
// Customer Reads  
export const getMyOrders = async () => {  
    if(!auth.currentUser) return [];  
    const snap = await getDocs(query(collection(db, "orders"), where("customerId", "==", auth.currentUser.uid), orderBy("createdAt", "desc")));  
    return snap.docs.map(d => ({id: d.id, ...d.data()}));  
};
