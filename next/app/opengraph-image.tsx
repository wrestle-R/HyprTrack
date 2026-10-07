import { ImageResponse } from "next/og";
export const alt = "HyprTrack — Time leaves a trace. Local activity tracking for Hyprland.";
export const size = {width:1200,height:630};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{display:"flex",width:"100%",height:"100%",background:"#f3f0e8",color:"#191916",padding:64,flexDirection:"column",justifyContent:"space-between"}}><div style={{display:"flex",fontSize:32,fontWeight:700,letterSpacing:-1}}>HyprTrack<span style={{color:"#bd471e"}}>.</span></div><div style={{display:"flex",flexDirection:"column",fontSize:110,fontWeight:700,lineHeight:1,letterSpacing:-6}}><span>Time leaves</span><span style={{color:"#bd471e"}}>a trace.</span></div><div style={{display:"flex",fontSize:22,borderTop:"1px solid #c9c5b9",paddingTop:22,justifyContent:"space-between"}}><span>Built for Hyprland. Kept on your machine.</span><span>Local. Free. Open source.</span></div></div>,size);
}
