# Live Firebase State — ntk-income-opportunity-hunter

Date: 2026-10-15  
Project ID: **`ntk-income-opportunity-hunter`**  
Project Number: `813703245101`  
Hosting Site: `https://ntk-income-opportunity-hunter.web.app`  
Billing Plan: **Spark ($0/month, free tier)**

---

## 1. Project Architecture & Resource Isolation

To protect existing projects and avoid schema collisions with earlier prototypes (`ntk-income-radar` and `ntk-api-tester`), the dedicated project `ntk-income-opportunity-hunter` was provisioned under the authenticated owner account (`chiplusmoney@gmail.com`).

| Resource | Value / Configuration | Status |
|---|---|---|
| **Project ID** | `ntk-income-opportunity-hunter` | ACTIVE |
| **Project Number** | `813703245101` | ACTIVE |
| **Firestore Database** | `(default)` | LIVE & POPULATED |
| **Web App ID** | `1:813703245101:web:7141d8564c561dd99677a4` | ACTIVE |
| **Hosting Domain** | `ntk-income-opportunity-hunter.web.app` | LIVE |
| **Service Account** | `firebase-adminsdk-fbsvc@ntk-income-opportunity-hunter.iam.gserviceaccount.com` | Key mounted on Render |

---

## 2. Firestore Collections & Live State

| Collection | Role | Current Document Count | Access Rule |
|---|---|---|---|
| `opportunities` | Publicly browseable opportunity catalog | 54 live documents | Read: Public (`visibility == 'published'`). Write: Admin SDK only. |
| `opportunityEvidence` | Verifiable evidence snapshots per opportunity | 54 live documents | Read: Public. Write: Admin SDK only. |
| `internalSourceRuns` | Audit log of scheduler crawler executions | 4 source run records | Read: Admin SDK only. Write: Admin SDK only. |
| `users` | User profile, bookmarks, and private trackers | Dynamic | Read/Write: Owner UID only. |

---

## 3. Firestore Security Rules

The live ruleset enforces least-privilege access and immutable evidence:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Opportunities: Public read for published items; no client write allowed
    match /opportunities/{opportunityId} {
      allow read: if resource.data.visibility == 'published';
      allow write: if false; // Only Admin SDK can write
    }

    // Opportunity Evidence: Public read; immutable from clients
    match /opportunityEvidence/{evidenceId} {
      allow read: if true;
      allow write: if false; // Only Admin SDK can write
    }

    // Source Runs: Internal audit log; completely hidden from web clients
    match /internalSourceRuns/{runId} {
      allow read, write: if false; // Only Admin SDK can read/write
    }

    // Users: Private to authenticated account
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /applications/{applicationId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /earnings/{earningId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

Behavioral validation:
- All 15 security rules assertions passed against the emulator test suite (`test/securityRules.test.ts`).
- Direct client write attempts to `opportunities` or `opportunityEvidence` return `PERMISSION_DENIED`.

---

## 4. Composite Indexes

Active indexes deployed and serving in `(default)`:

1. `opportunities`:
   - `visibility` (Ascending)
   - `zeroCapital` (Ascending)
   - `rankScore` (Descending)
2. `opportunities`:
   - `visibility` (Ascending)
   - `capitalStatus` (Ascending)
   - `rankScore` (Descending)

---

## 5. Web Client Configuration

Public Firebase client configuration compiled into PWA build:

```typescript
const firebaseConfig = {
  apiKey: "AIzaSyCKdbOl94kSQz2rTDoJjggMOy-oGjHbvHg",
  authDomain: "ntk-income-opportunity-hunter.firebaseapp.com",
  projectId: "ntk-income-opportunity-hunter",
  storageBucket: "ntk-income-opportunity-hunter.firebasestorage.app",
  messagingSenderId: "813703245101",
  appId: "1:813703245101:web:7141d8564c561dd99677a4"
};
```
*Note: Firebase web client config keys are public client identifiers, not private secrets.*
