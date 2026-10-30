import { Lobby } from '@/components/Lobby';
export default async function Page({params}:{params:Promise<{code:string}>}) { const {code}=await params; return <Lobby code={code.toUpperCase()}/>; }
