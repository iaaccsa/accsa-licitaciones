import type { FormEvent } from "react";

// Native constraint validation bubbles use the browser language, not the
// document language. Replace their text with Spanish via setCustomValidity.
export function validationMessage(input: HTMLInputElement): string {
    const validity = input.validity;
    if (validity.valueMissing) return "Completa este campo.";
    if (validity.typeMismatch) {
        if (input.type === "email") return "Ingresa un correo electrónico válido.";
        if (input.type === "url") return "Ingresa una URL válida.";
        return "El formato ingresado no es válido.";
    }
    if (validity.tooShort) return `Ingresa al menos ${input.minLength} caracteres.`;
    if (validity.tooLong) return `Ingresa como máximo ${input.maxLength} caracteres.`;
    if (validity.rangeUnderflow) return `Ingresa un valor mayor o igual a ${input.min}.`;
    if (validity.rangeOverflow) return `Ingresa un valor menor o igual a ${input.max}.`;
    if (validity.stepMismatch) return "Ingresa un valor válido.";
    if (validity.patternMismatch) return "El formato ingresado no es válido.";
    if (validity.badInput) return "Ingresa un valor válido.";
    return "El valor ingresado no es válido.";
}

// Spread on any input with native constraints. Clearing the custom validity on
// input is mandatory: a non-empty one keeps the field invalid forever.
export const spanishValidationProps = {
    onInvalid: (e: FormEvent<HTMLInputElement>) => {
        e.currentTarget.setCustomValidity(validationMessage(e.currentTarget));
    },
    onInput: (e: FormEvent<HTMLInputElement>) => {
        e.currentTarget.setCustomValidity("");
    },
};
