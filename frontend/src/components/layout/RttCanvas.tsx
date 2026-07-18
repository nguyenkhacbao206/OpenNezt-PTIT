/**
 * RttCanvas — scale-to-fit khung cho luồng RTT.
 *
 * Các màn RTT (Demo1..Demo8) được cắt theo tỉ lệ DESKTOP: font/padding cố định
 * lớn, layout dàn ngang. Trên điện thoại (màn hẹp) chúng sẽ tràn/vỡ. Thay vì viết
 * lại 8 màn cho responsive, ta render layout desktop ở một CHIỀU RỘNG THIẾT KẾ cố
 * định (`DESIGN_WIDTH`) rồi `transform: scale` cho vừa khít bề rộng thật của thiết
 * bị — y như cách scale trên desktop, chỉ khác hệ số.
 *
 * Desktop KHÔNG bị đụng tới: khi bề rộng ≥ `DESIGN_WIDTH` ta render thẳng children
 * (hệ số scale = 1, không bọc gì thêm).
 */
import type { ComponentType, ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

/** Bề rộng "thiết kế" mà layout desktop giả định. Màn hẹp hơn mức này sẽ được thu nhỏ. */
const DESIGN_WIDTH = 1024;

export interface RttCanvasProps {
  children: ReactNode;
}

export function RttCanvas({ children }: RttCanvasProps) {
  const { width, height } = useWindowDimensions();

  // Đủ rộng (desktop/tablet ngang) → giữ nguyên, không scale.
  if (width >= DESIGN_WIDTH) {
    return <View className="flex-1">{children}</View>;
  }

  // Điện thoại: thu nhỏ khung desktop vừa khít bề rộng. Chiều cao khung = height / s
  // để sau khi scale phủ đúng chiều cao thật (các màn dùng flex-1 sẽ lấp đầy khung).
  const s = width / DESIGN_WIDTH;

  return (
    <View className="flex-1 overflow-hidden bg-tp-bg">
      <View
        style={{
          width: DESIGN_WIDTH,
          height: height / s,
          transform: [{ scale: s }],
          transformOrigin: 'top left',
        }}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * Bọc một màn (screen component) trong {@link RttCanvas}. Giữ nguyên props để dùng
 * trực tiếp làm `component` cho native-stack `Stack.Screen`.
 */
export function withRttCanvas<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function RttCanvasScreen(props: P) {
    return (
      <RttCanvas>
        <Screen {...props} />
      </RttCanvas>
    );
  }
  RttCanvasScreen.displayName = `withRttCanvas(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return RttCanvasScreen;
}
