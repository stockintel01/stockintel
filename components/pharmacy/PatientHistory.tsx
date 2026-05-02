
"use client";

import { useState } from "react";
import { Patient, PatientHistoryRecord } from "@/types/patient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";

interface PatientHistoryProps {
    patient: Patient;
    onBack: () => void;
}

export function PatientHistory({ patient, onBack }: PatientHistoryProps) {
    const [addingRecord, setAddingRecord] = useState(false);
    const [newPrescription, setNewPrescription] = useState("");
    const [newNotes, setNewNotes] = useState("");
    const [loading, setLoading] = useState(false);

    const handleAddRecord = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const newRecord: PatientHistoryRecord = {
                id: crypto.randomUUID(),
                date: new Date().toISOString(),
                // In a real app, this should be the logged-in pharmacy's ID
                pharmacyId: "current-pharmacy-id",
                pharmacyName: "Pharmacy Name (Current)",
                prescription: newPrescription,
                notes: newNotes,
            };

            const patientRef = doc(db, "patients", patient.id);
            await updateDoc(patientRef, {
                history: arrayUnion(newRecord)
            });

            // Update local state to reflect change immediately (optimistic UI)
            if (!patient.history) patient.history = [];
            patient.history.push(newRecord);

            setAddingRecord(false);
            setNewPrescription("");
            setNewNotes("");
        } catch (error) {
            console.error("Error adding record:", error);
            alert("Failed to add record.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Button variant="outline" onClick={onBack} className="mb-4">
                &larr; Back to Search
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Patient Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div>
                            <Label>Name</Label>
                            <div className="font-medium">{patient.fullName}</div>
                        </div>
                        <div>
                            <Label>Date of Birth</Label>
                            <div>{patient.dateOfBirth}</div>
                        </div>
                        <div>
                            <Label>Contact</Label>
                            <div>{patient.contactNumber}</div>
                        </div>
                        {patient.allergies && patient.allergies.length > 0 && (
                            <div>
                                <Label className="text-red-500">Allergies</Label>
                                <div className="text-red-500 font-bold">{patient.allergies.join(", ")}</div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Add New Record</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!addingRecord ? (
                            <Button onClick={() => setAddingRecord(true)} className="w-full">
                                Add Visit / Prescription
                            </Button>
                        ) : (
                            <form onSubmit={handleAddRecord} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Prescription / Treatment</Label>
                                    <Input
                                        value={newPrescription}
                                        onChange={(e) => setNewPrescription(e.target.value)}
                                        required
                                        placeholder="e.g. Amoxicillin 500mg"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Notes (Private/Public)</Label>
                                    <textarea
                                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={newNotes}
                                        onChange={(e) => setNewNotes(e.target.value)}
                                        placeholder="Additional clinical notes..."
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button type="submit" disabled={loading}>
                                        {loading ? "Saving..." : "Save Record"}
                                    </Button>
                                    <Button type="button" variant="ghost" onClick={() => setAddingRecord(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Global History</CardTitle>
                </CardHeader>
                <CardContent>
                    {!patient.history || patient.history.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">No history records found.</p>
                    ) : (
                        <div className="space-y-4">
                            {[...patient.history].reverse().map((record) => (
                                <div key={record.id} className="border p-4 rounded-lg bg-card text-card-foreground shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-semibold">{record.pharmacyName}</h4>
                                            <p className="text-sm text-muted-foreground">{new Date(record.date).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p><strong>Prescription:</strong> {record.prescription}</p>
                                        {record.notes && <p className="text-sm"><strong>Notes:</strong> {record.notes}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
