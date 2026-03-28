const text = '[ACTION: ASK_USER]\\n\\\json\\n{\
question\:\A\,\options\:[\B\]}\\n\\\';
const p = '\\\\[ACTION: ASK_USER\\\\]\\\\s*\\\(?:json)?\\\\s*([\\\\s\\\\S]*?)\\\\s*\\\';
const re = new RegExp(p);
console.log(text.match(re)?.[1]);
