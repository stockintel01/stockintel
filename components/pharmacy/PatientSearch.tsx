
"use client";

import { useState } from "react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Patient } from "@/types/patient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";

interface PatientSearchProps {
    onPatientSelect: (patient: Patient) => void;
}

export function PatientSearch({ onPatientSelect }: PatientSearchProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<Patient[]>([]);
    const [error, setError] = useState("");

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError("");
        setResults([]);

        try {
            // NOTE: Firestore search is limited. For production, consider Algolia or similar.
            // Here we implement a basic prefix search on fullName.
            const patientsRef = collection(db, "patients");
            const q = query(
                patientsRef,
                where("fullName", ">=", searchTerm),
                where("fullName", "<=", searchTerm + "\uf8ff"),
                limit(5)
            );

            const querySnapshot = await getDocs(q);
            const foundPatients: Patient[] = [];
            querySnapshot.forEach((doc) => {
                foundPatients.push({ id: doc.id, ...doc.data() } as Patient);
            });

            setResults(foundPatients);
            if (foundPatients.length === 0) {
                // Try searching by contact number instead if name yields no results?
                // keeping it simple for now.
            }
        } catch (err: any) {
            console.error("Error searching patients:", err);
            setError("Failed to search patients. Ensure Firestore is configured.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                    placeholder="Search by Patient Name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Button type="submit" disabled={loading}>
                    {loading ? "Searching..." : <Search className="w-4 h-4" />}
                </Button>
            </form>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            {results.length > 0 && (
                <Card>
                    <CardContent className="p-2 space-y-2">
                        {results.map((patient) => (
                            <div
                                key={patient.id}
                                className="p-2 hover:bg-muted rounded-md cursor-pointer border-b last:border-0"
                                onClick={() => onPatientSelect(patient)}
                            >
                                <p className="font-medium">{patient.fullName}</p>
                                <p className="text-sm text-muted-foreground">{patient.contactNumber} | {patient.dateOfBirth}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
