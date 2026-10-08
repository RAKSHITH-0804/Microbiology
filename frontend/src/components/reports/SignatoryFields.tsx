import type { UseFormRegisterReturn } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { NativeSelect } from '@/components/ui/native-select';
import type { MasterStaff } from '@/types/report';

interface SignatoryFieldsProps {
  staff: MasterStaff[];
  preparedBy: UseFormRegisterReturn;
  reportedBy: UseFormRegisterReturn;
  preparedError?: string;
  reportedError?: string;
  disabled?: boolean;
}

export function SignatoryFields({ staff, preparedBy, reportedBy, preparedError, reportedError, disabled }: SignatoryFieldsProps) {
  const technicians = staff.filter((s) => s.staff_role === 'LAB_TECH');
  const doctors = staff.filter((s) => s.staff_role === 'DOCTOR');

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Prepared by (Lab Technician)" htmlFor="prepared_by" required error={preparedError}>
        <NativeSelect id="prepared_by" disabled={disabled} aria-invalid={!!preparedError} {...preparedBy}>
          <option value="">Select technician</option>
          {technicians.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} - {s.designation}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Reported by (Doctor)" htmlFor="reported_by" required error={reportedError}>
        <NativeSelect id="reported_by" disabled={disabled} aria-invalid={!!reportedError} {...reportedBy}>
          <option value="">Select doctor</option>
          {doctors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} - {s.designation}
            </option>
          ))}
        </NativeSelect>
      </FormField>
    </div>
  );
}
