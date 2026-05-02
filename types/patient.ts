
export interface PatientHistoryRecord {
    id: string;
    date: string; // ISO String
    pharmacyId: string;
    pharmacyName: string;
    diagnosis?: string;
    prescription: string;
    notes?: string;
    // Make records visible globally or private? 
    // Requirement: "globally" but "particular pharmacy when entered ... every patients should be seen"
    // Interpreted as: Global visibility of the record.
}

export interface Patient {
    id: string; // Firestore Document ID
    fullName: string;
    dateOfBirth: string; // YYYY-MM-DD
    contactNumber: string;
    address?: string;
    allergies?: string[];
    // Global history
    history?: PatientHistoryRecord[];
    createdAt: string;
}
