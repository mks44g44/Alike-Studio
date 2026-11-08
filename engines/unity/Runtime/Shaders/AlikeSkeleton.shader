// Alike runtime for Unity — skeleton shader: premultiplied output, two-color tint (dark color in TEXCOORD1),
// blend mode set per material (_SrcBlend/_DstBlend). Works in the Built-in pipeline and in URP (unlit pass).
Shader "Alike/Skeleton"
{
    Properties
    {
        _MainTex ("Atlas page", 2D) = "white" {}
        [Toggle] _StraightAlpha ("Texture has straight (non-premultiplied) alpha", Float) = 1
        [HideInInspector] _SrcBlend ("Src blend", Float) = 1
        [HideInInspector] _DstBlend ("Dst blend", Float) = 10
    }
    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" "PreviewType" = "Plane" "CanUseSpriteAtlas" = "True" }
        Cull Off
        ZWrite Off
        Lighting Off
        Blend [_SrcBlend] [_DstBlend]

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float _StraightAlpha;

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; float4 dark : TEXCOORD1; fixed4 color : COLOR; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 dark : TEXCOORD1; fixed4 color : COLOR; };

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv; o.dark = v.dark; o.color = v.color;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                fixed4 t = tex2D(_MainTex, i.uv);
                if (_StraightAlpha > 0.5) t.rgb *= t.a;
                float3 rgb = t.rgb * i.color.rgb + (t.a - t.rgb) * i.dark.rgb * i.dark.a;
                return fixed4(rgb * i.color.a, t.a * i.color.a);
            }
            ENDCG
        }
    }
}
