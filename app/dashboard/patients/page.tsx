"use client";

import { useState } from "react";
import { PatientSearch } from "@/components/pharmacy/PatientSearch";
import { PatientHistory } from "@/components/pharmacy/PatientHistory";
import { Patient } from "@/types/patient";
import { UserRound, Search, ClipboardList, TrendingUp } from "lucide-react";

const stats = [
    { label: 'Patients Today', value: '24', icon: UserRound },
    { label: 'Prescriptions Filled', value: '87', icon: ClipboardList },
    { label: 'Follow-ups Pending', value: '6', icon: TrendingUp },
];

export default function PatientsPage() {
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Patient History</h1>
                    <p className="text-muted-foreground mt-1">Search any patient to view their complete prescription and visit history.</p>
                </div>
            </div>

            {!selectedPatient ? (
                <div className="space-y-8">
                    {/* Quick stats */}
                    <div className="grid gap-4 grid-cols-3">
                        {stats.map((s, i) => (
                            <div key={i} className="bg-background border rounded-xl p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <s.icon className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{s.value}</p>
                                    <p className="text-xs text-muted-foreground">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Search area with empty state */}
                    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl bg-muted/10">
                        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                            <Search className="w-10 h-10 text-primary/40" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">Search for a Patient</h2>
                        <p className="text-muted-foreground text-sm max-w-sm mb-8">
                            Enter a patient's name, phone number, or ID to pull up their full medical history, prescriptions, and purchase records.
                        </p>
                        <div className="w-full max-w-md">
                            <PatientSearch onPatientSelect={setSelectedPatient} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-4">
                            Patient data is stored securely and accessible only to your organization.
                        </p>
                    </div>
                </div>
            ) : (
                <PatientHistory
                    patient={selectedPatient}
                    onBack={() => setSelectedPatient(null)}
                />
            )}
        </div>
    );
}
