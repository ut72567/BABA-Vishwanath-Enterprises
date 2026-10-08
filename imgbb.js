
import { functions } from './firebase.js';  
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";  
  
const uploadProxy = httpsCallable(functions, 'uploadImageProxy');  
  
export async function uploadToImgBB(file) {  
    return new Promise((resolve, reject) => {  
        const reader = new FileReader();  
        reader.readAsDataURL(file);  
        reader.onload = async () => {  
            try {  
                // Resize logic could go here; sending base64 to secure backend  
                const result = await uploadProxy({ base64Image: reader.result });  
                resolve(result.data.url);  
            } catch(e) {  
                reject(e);  
            }  
        };  
        reader.onerror = error => reject(error);  
    });  
}
