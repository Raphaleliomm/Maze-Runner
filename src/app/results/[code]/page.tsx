import { Results } from '@/components/Results';
export default async function Page({params}:{params:Promise<{code:string}>}) { const {code}=await params; return <Results code={code.toUpperCase()}/>; }
