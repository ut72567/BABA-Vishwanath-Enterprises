import { db, auth } from "./firebase.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


/* =========================================
   SITE SETTINGS
========================================= */

export const getSiteSettings = async () => {

    const snap = await getDoc(
        doc(
            db,
            "siteSettings",
            "main"
        )
    );

    return snap.exists()
        ? snap.data()
        : null;
};


/* =========================================
   SLIDERS
========================================= */

export const getSliders = async () => {

    const snap = await getDocs(
        query(
            collection(
                db,
                "sliders"
            ),
            orderBy(
                "displayOrder"
            )
        )
    );

    return snap.docs.map(
        (d) => ({
            id: d.id,
            ...d.data()
        })
    );
};


/* =========================================
   CATEGORIES
========================================= */

export const getCategories = async () => {

    const snap = await getDocs(
        query(
            collection(
                db,
                "categories"
            ),
            orderBy(
                "displayOrder"
            )
        )
    );

    return snap.docs.map(
        (d) => ({
            id: d.id,
            ...d.data()
        })
    );
};


/* =========================================
   MATERIALS
========================================= */

export const getMaterials = async () => {

    const snap = await getDocs(
        collection(
            db,
            "materials"
        )
    );

    return snap.docs.map(
        (d) => ({
            id: d.id,
            ...d.data()
        })
    );
};


/* =========================================
   PRODUCTS
========================================= */

export const getProducts = async (
    filters = {}
) => {

    const constraints = [];


    if (filters.category) {

        constraints.push(
            where(
                "category",
                "==",
                filters.category
            )
        );
    }


    if (filters.isLatest) {

        constraints.push(
            where(
                "isLatest",
                "==",
                true
            )
        );
    }


    const snap = await getDocs(
        query(
            collection(
                db,
                "products"
            ),
            ...constraints
        )
    );


    return snap.docs.map(
        (d) => ({
            id: d.id,
            ...d.data()
        })
    );
};


/* =========================================
   SINGLE PRODUCT
========================================= */

export const getProductBySlug =
    async (slug) => {

        if (!slug) {
            return null;
        }


        const snap =
            await getDocs(
                query(
                    collection(
                        db,
                        "products"
                    ),
                    where(
                        "slug",
                        "==",
                        slug
                    )
                )
            );


        if (!snap.empty) {

            return {
                id: snap.docs[0].id,
                ...snap.docs[0].data()
            };
        }


        try {

            const direct =
                await getDoc(
                    doc(
                        db,
                        "products",
                        slug
                    )
                );


            if (!direct.exists()) {
                return null;
            }


            return {
                id: direct.id,
                ...direct.data()
            };

        } catch (error) {

            console.error(error);

            return null;
        }
    };


/* =========================================
   ABOUT CONTENT
========================================= */

export const getAboutContent =
    async () => {

        const snap =
            await getDoc(
                doc(
                    db,
                    "aboutContent",
                    "main"
                )
            );


        return snap.exists()
            ? snap.data()
            : null;
    };


/* =========================================
   B2B ORDER
========================================= */

export const submitB2BOrder =
    async (orderPayload) => {

        if (!auth.currentUser) {

            throw new Error(
                "Please login before placing an order."
            );
        }


        if (
            !orderPayload ||
            typeof orderPayload !== "object"
        ) {

            throw new Error(
                "Invalid order data."
            );
        }


        const order = {

            ...orderPayload,

            customerId:
                auth.currentUser.uid,

            customerEmail:
                auth.currentUser.email || "",

            status:
                "pending",

            createdAt:
                serverTimestamp()
        };


        const ref =
            await addDoc(
                collection(
                    db,
                    "orders"
                ),
                order
            );


        return {
            id: ref.id
        };
    };


/* =========================================
   ENQUIRY
========================================= */

export const submitEnquiry =
    async (enquiryPayload) => {

        if (
            !enquiryPayload ||
            typeof enquiryPayload !== "object"
        ) {

            throw new Error(
                "Invalid enquiry data."
            );
        }


        const enquiry = {

            ...enquiryPayload,

            customerId:
                auth.currentUser?.uid || null,

            customerEmail:
                auth.currentUser?.email || "",

            status:
                "new",

            createdAt:
                serverTimestamp()
        };


        const ref =
            await addDoc(
                collection(
                    db,
                    "enquiries"
                ),
                enquiry
            );


        return {
            id: ref.id
        };
    };


/* =========================================
   CUSTOMER ORDERS
========================================= */

export const getMyOrders =
    async () => {

        if (!auth.currentUser) {
            return [];
        }


        const snap =
            await getDocs(
                query(
                    collection(
                        db,
                        "orders"
                    ),

                    where(
                        "customerId",
                        "==",
                        auth.currentUser.uid
                    ),

                    orderBy(
                        "createdAt",
                        "desc"
                    )
                )
            );


        return snap.docs.map(
            (d) => ({
                id: d.id,
                ...d.data()
            })
        );
    };